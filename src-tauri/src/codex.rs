//! Hosts the user's own Codex CLI, the second agent harness.
//!
//! Sign-in belongs to the CLI, as with Claude Code: `codex login` runs
//! OpenAI's browser flow and keeps the login itself. This module never reads,
//! stores or asks for a credential, and never opens `~/.codex/auth.json`.
//!
//! Codex has no long-lived stdin protocol outside its experimental app server,
//! so each message is one `codex exec --json` process: the first starts a
//! thread, later ones resume it by id. Its events are translated into the
//! stream-json shapes Claude Code emits, so the app reads both the same way.

use serde::Serialize;
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

/// An API key in the environment would bill the key instead of the ChatGPT plan.
const BLOCKED_ENV: &[&str] = &["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID"];

/// Codex features that give the model tools or pull in the user's own setup.
/// With the code-mode host off, the one code tool Codex keeps fails closed, so
/// the agent can't run commands or read files: like Claude Code's `--tools ""`.
const DISABLED_FEATURES: &[&str] = &[
  "multi_agent", "shell_tool", "unified_exec", "code_mode_host", "code_mode", "apps", "plugins", "skill_search",
  "browser_use", "computer_use", "image_generation", "view_image", "sleep_tool", "goals", "in_app_browser",
  "tool_suggest", "hooks", "default_mode_request_user_input", "current_time_reminder",
];

/// Instructions Codex adds that describe tools, skills and a workspace this agent doesn't have.
const CONFIG: &[&str] = &[
  "sandbox_mode=\"read-only\"",
  "approval_policy=\"never\"",
  "web_search=\"disabled\"",
  "skills.include_instructions=false",
  "include_permissions_instructions=false",
  "include_apps_instructions=false",
  "include_collaboration_mode_instructions=false",
  "include_environment_context=false",
];

const BATCH_INTERVAL: Duration = Duration::from_millis(16);
const STOP_GRACE: Duration = Duration::from_secs(2);
/// How long a new message waits for the last one's process to exit after it finished.
const EXIT_GRACE: Duration = Duration::from_secs(5);
const STDERR_LINES: usize = 20;
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

pub type OnBatch = Arc<dyn Fn(Vec<Value>) + Send + Sync>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexStatus {
  installed: bool,
  version: Option<String>,
  logged_in: bool,
  /// "chatgpt" for the plan login, "api-key" when it would bill a key.
  subscription: Option<String>,
}

/// Apps opened from Finder don't inherit the shell's PATH, so check the usual
/// install locations, then the Codex app's bundled CLI, then the login shell.
pub fn find_cli() -> Option<PathBuf> {
  let home = std::env::var("HOME").unwrap_or_default();
  let known = [
    format!("{home}/.local/bin/codex"),
    "/opt/homebrew/bin/codex".to_string(),
    "/usr/local/bin/codex".to_string(),
    "/Applications/Codex.app/Contents/Resources/codex".to_string(),
  ];
  if let Some(path) = known.iter().map(PathBuf::from).find(|p| p.is_file()) {
    return Some(path);
  }
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
  let output = Command::new(shell).args(["-ilc", "command -v codex"]).stdin(Stdio::null()).output().ok()?;
  let found = String::from_utf8_lossy(&output.stdout);
  found.lines().last().map(PathBuf::from).filter(|p| p.is_file())
}

pub fn cli(path: &Path) -> Command {
  let mut command = Command::new(path);
  for name in BLOCKED_ENV {
    command.env_remove(name);
  }
  command
}

/// `codex login status` says how it's signed in on one line. Only the method is kept.
fn login_method(text: &str) -> Option<&'static str> {
  let text = text.to_lowercase();
  if text.contains("not logged in") { None }
  else if text.contains("chatgpt") { Some("chatgpt") }
  else if text.contains("api key") { Some("api-key") }
  else if text.contains("logged in") { Some("other") }
  else { None }
}

pub fn status() -> CodexStatus {
  let Some(path) = find_cli() else {
    return CodexStatus { installed: false, version: None, logged_in: false, subscription: None };
  };
  let version = cli(&path).arg("--version").stdin(Stdio::null()).output().ok()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().trim_start_matches("codex-cli").trim().to_string())
    .filter(|v| !v.is_empty());
  let method = cli(&path).args(["login", "status"]).stdin(Stdio::null()).output().ok()
    .and_then(|o| login_method(&format!("{}\n{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))));
  CodexStatus { installed: true, version, logged_in: method.is_some(), subscription: method.map(str::to_string) }
}

/// The models the installed CLI offers, shaped like Claude Code's list. `codex
/// debug models` reads the catalog without a model request, so it costs nothing.
pub fn models(path: &Path) -> Result<Value, String> {
  let child = cli(path).args(["debug", "models"]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null())
    .spawn().map_err(|e| format!("Couldn't start Codex: {e}"))?;
  let (tx, rx) = mpsc::channel();
  let pid = child.id();
  std::thread::spawn(move || { let _ = tx.send(child.wait_with_output()); });
  let output = match rx.recv_timeout(PROBE_TIMEOUT) {
    Ok(Ok(output)) => output,
    Ok(Err(e)) => return Err(e.to_string()),
    Err(_) => {
      let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
      return Err("Codex didn't answer in time".into());
    }
  };
  let catalog: Value = serde_json::from_slice(&output.stdout).map_err(|_| "This Codex doesn't list its models".to_string())?;
  Ok(catalog_models(&catalog))
}

fn catalog_models(catalog: &Value) -> Value {
  let mut listed: Vec<&Value> = catalog["models"].as_array().into_iter().flatten()
    .filter(|m| m["visibility"] == "list" && m["slug"].is_string())
    .collect();
  listed.sort_by_key(|m| m["priority"].as_i64().unwrap_or(i64::MAX));
  Value::Array(listed.into_iter().map(|m| {
    let levels: Vec<Value> = m["supported_reasoning_levels"].as_array().into_iter().flatten().filter_map(|l| l["effort"].as_str().map(|e| json!(e))).collect();
    json!({
      "value": m["slug"],
      "displayName": m["display_name"].as_str().or(m["slug"].as_str()),
      "description": m["description"],
      "supportsEffort": !levels.is_empty(),
      "supportedEffortLevels": levels,
    })
  }).collect())
}

/// A conversation with Codex. Each message runs one process; the thread id
/// carries the conversation from one to the next.
pub struct CodexSession {
  path: PathBuf,
  cwd: PathBuf,
  model: Option<String>,
  effort: Option<String>,
  prompt: &'static str,
  thread: Arc<Mutex<Option<String>>>,
  turn: Arc<Mutex<Option<Child>>>,
  on_batch: OnBatch,
}

impl CodexSession {
  pub fn new(path: PathBuf, cwd: PathBuf, resume: Option<String>, model: Option<String>, effort: Option<String>, prompt: &'static str, on_batch: OnBatch) -> Self {
    Self { path, cwd, model, effort, prompt, thread: Arc::new(Mutex::new(resume)), turn: Arc::new(Mutex::new(None)), on_batch }
  }

  fn args(&self, thread: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = vec!["exec".into()];
    if thread.is_some() {
      args.push("resume".into());
    }
    args.extend(["--json", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"].map(str::to_string));
    for feature in DISABLED_FEATURES {
      args.extend(["--disable".to_string(), feature.to_string()]);
    }
    for setting in CONFIG {
      args.extend(["-c".to_string(), setting.to_string()]);
    }
    // A JSON string is a valid TOML basic string, quotes, newlines and all.
    args.extend(["-c".to_string(), format!("developer_instructions={}", serde_json::to_string(self.prompt).unwrap_or_default())]);
    if let Some(effort) = &self.effort {
      args.extend(["-c".to_string(), format!("model_reasoning_effort={}", serde_json::to_string(effort).unwrap_or_default())]);
    }
    if let Some(model) = &self.model {
      args.extend(["-m".to_string(), model.clone()]);
    }
    if let Some(thread) = thread {
      args.push(thread.to_string());
    }
    // The prompt comes from stdin, so one starting with "-" isn't read as a flag.
    args.push("-".into());
    args
  }

  /// Runs one message. Its events arrive translated, ending in one `result`.
  pub fn send(&self, text: &str) -> Result<(), String> {
    let mut turn = self.turn.lock().unwrap();
    // Codex reports the turn done a moment before its process exits, and the
    // app may send the next message straight after, so give it that moment.
    let deadline = Instant::now() + EXIT_GRACE;
    while turn.as_mut().is_some_and(|c| matches!(c.try_wait(), Ok(None))) {
      if Instant::now() > deadline {
        return Err("Codex is still answering".into());
      }
      std::thread::sleep(Duration::from_millis(50));
    }
    let thread = self.thread.lock().unwrap().clone();
    let mut child = cli(&self.path)
      .args(self.args(thread.as_deref()))
      .current_dir(&self.cwd)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("Couldn't start Codex: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("Codex has no stdin")?;
    let stdout = child.stdout.take().ok_or("Codex has no stdout")?;
    let stderr = child.stderr.take().ok_or("Codex has no stderr")?;
    stdin.write_all(text.as_bytes()).map_err(|e| format!("Couldn't reach Codex: {e}"))?;
    drop(stdin);

    let tail = Arc::new(Mutex::new(Vec::<String>::new()));
    let writer = tail.clone();
    std::thread::spawn(move || {
      for line in BufReader::new(stderr).lines().map_while(Result::ok) {
        let mut lines = writer.lock().unwrap();
        lines.push(line);
        if lines.len() > STDERR_LINES {
          lines.remove(0);
        }
      }
    });

    let model = self.model.clone().unwrap_or_else(|| "codex".into());
    let threads = self.thread.clone();
    let (tx, rx) = mpsc::channel::<Value>();
    std::thread::spawn(move || {
      let mut reader = Translator::new(model);
      for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(id) = event["thread_id"].as_str().filter(|_| event["type"] == "thread.started") {
          *threads.lock().unwrap() = Some(id.to_string());
        }
        for out in reader.translate(&event) {
          if tx.send(out).is_err() {
            return;
          }
        }
      }
      // A turn that ended without saying so failed, or was stopped.
      if !reader.finished {
        std::thread::sleep(Duration::from_millis(50));
        let stderr = tail.lock().unwrap().iter().rev().find(|l| !l.trim().is_empty() && !l.contains("failed to load skill")).cloned();
        let _ = tx.send(reader.failure(stderr));
      }
    });
    let on_batch = self.on_batch.clone();
    std::thread::spawn(move || {
      while let Ok(first) = rx.recv() {
        std::thread::sleep(BATCH_INTERVAL);
        let mut batch = vec![first];
        batch.extend(rx.try_iter());
        on_batch(batch);
      }
    });
    *turn = Some(child);
    Ok(())
  }

  /// SIGINT lets Codex end the turn and keep the thread; kill it only if it doesn't exit.
  pub fn stop(self) {
    let Some(mut child) = self.turn.lock().unwrap().take() else { return };
    let _ = Command::new("kill").args(["-INT", &child.id().to_string()]).status();
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
      if matches!(child.try_wait(), Ok(Some(_))) {
        return;
      }
      std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
  }
}

/// Turns Codex's exec events into the stream-json events the app reads from
/// Claude Code: `system/init`, text and thinking blocks, and one `result`.
struct Translator {
  model: String,
  started: bool,
  finished: bool,
  /// The last error Codex reported in the turn, for the failure message.
  error: Option<String>,
}

impl Translator {
  fn new(model: String) -> Self {
    Self { model, started: false, finished: false, error: None }
  }

  fn translate(&mut self, event: &Value) -> Vec<Value> {
    match event["type"].as_str().unwrap_or_default() {
      "thread.started" => vec![json!({
        "type": "system", "subtype": "init", "session_id": event["thread_id"], "model": self.model,
        // The host strips API keys from the environment, so Codex runs on its own login.
        "apiKeySource": "none", "tools": [],
      })],
      "turn.started" => {
        self.started = true;
        vec![]
      }
      "item.completed" => {
        let item = &event["item"];
        match item["type"].as_str().unwrap_or_default() {
          "agent_message" => block("text", "text_delta", "text", item["text"].as_str().unwrap_or_default()),
          "reasoning" => block("thinking", "thinking_delta", "thinking", item["text"].as_str().unwrap_or_default()),
          // Setup notices before the turn (the disabled code-mode host says so) aren't the agent's.
          "error" if self.started => {
            self.error = item["message"].as_str().map(str::to_string);
            vec![]
          }
          _ => vec![],
        }
      }
      "turn.completed" => {
        self.finished = true;
        let usage = &event["usage"];
        let input = usage["input_tokens"].as_u64().unwrap_or(0);
        let cached = usage["cached_input_tokens"].as_u64().unwrap_or(0);
        vec![json!({
          "type": "result", "subtype": "success", "is_error": false,
          "usage": {
            "input_tokens": input.saturating_sub(cached),
            "cache_read_input_tokens": cached,
            "cache_creation_input_tokens": usage["cache_write_input_tokens"].as_u64().unwrap_or(0),
            "output_tokens": usage["output_tokens"].as_u64().unwrap_or(0) + usage["reasoning_output_tokens"].as_u64().unwrap_or(0),
          },
        })]
      }
      "turn.failed" => {
        self.finished = true;
        let message = event["error"]["message"].as_str().map(str::to_string).or(self.error.take()).unwrap_or_else(|| "Codex couldn't finish that.".into());
        vec![json!({ "type": "result", "subtype": "error", "is_error": true, "result": message })]
      }
      "error" => {
        self.error = event["message"].as_str().map(str::to_string);
        vec![]
      }
      _ => vec![],
    }
  }

  fn failure(&mut self, stderr: Option<String>) -> Value {
    self.finished = true;
    let detail = self.error.take().or(stderr);
    let message = detail.map(|d| format!("Codex stopped: {d}")).unwrap_or_else(|| "Codex stopped before it replied.".into());
    json!({ "type": "result", "subtype": "error", "is_error": true, "result": message })
  }
}

/// One whole block as Claude Code streams it: a start, then the text as one delta.
fn block(kind: &str, delta: &str, field: &str, text: &str) -> Vec<Value> {
  if text.is_empty() {
    return vec![];
  }
  vec![
    json!({ "type": "stream_event", "event": { "type": "content_block_start", "content_block": { "type": kind, field: "" } } }),
    json!({ "type": "stream_event", "event": { "type": "content_block_delta", "delta": { "type": delta, field: text } } }),
  ]
}

/// Runs the CLI's own sign-in, which opens OpenAI's page in the browser.
pub fn login(path: &Path) -> Result<Child, String> {
  cli(path).arg("login").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| format!("Couldn't start sign-in: {e}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn run(lines: &[&str]) -> (Vec<Value>, Translator) {
    let mut t = Translator::new("gpt-6-luna".into());
    let out = lines.iter().flat_map(|l| t.translate(&serde_json::from_str(l).unwrap())).collect();
    (out, t)
  }

  /// A real `codex exec --json` run, as captured from codex-cli 0.166.
  #[test]
  fn translates_a_turn_into_stream_json() {
    let (out, t) = run(&[
      r#"{"type":"thread.started","thread_id":"01a1b0a7-22ac-7043-a5cd-5f26a4787618"}"#,
      r#"{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Code Mode is unavailable because code-mode host is disabled."}}"#,
      r#"{"type":"turn.started"}"#,
      r#"{"type":"item.completed","item":{"id":"item_1","type":"reasoning","text":"Thinking it over"}}"#,
      r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"ready"}}"#,
      r#"{"type":"turn.completed","usage":{"input_tokens":13435,"cached_input_tokens":6912,"cache_write_input_tokens":0,"output_tokens":46,"reasoning_output_tokens":4}}"#,
    ]);
    assert!(t.finished);
    assert_eq!(out[0]["type"], "system");
    assert_eq!(out[0]["session_id"], "01a1b0a7-22ac-7043-a5cd-5f26a4787618");
    assert_eq!(out[0]["apiKeySource"], "none");
    assert_eq!(out[1]["event"]["content_block"]["type"], "thinking");
    assert_eq!(out[2]["event"]["delta"]["thinking"], "Thinking it over");
    assert_eq!(out[4]["event"]["delta"]["text"], "ready");
    let result = out.last().unwrap();
    assert_eq!(result["is_error"], false);
    assert_eq!(result["usage"]["input_tokens"], 6523);
    assert_eq!(result["usage"]["cache_read_input_tokens"], 6912);
    assert_eq!(result["usage"]["output_tokens"], 50);
    // The setup notice before the turn isn't shown or kept.
    assert_eq!(out.len(), 6);
  }

  #[test]
  fn reports_a_failed_turn() {
    let (out, _) = run(&[r#"{"type":"turn.started"}"#, r#"{"type":"turn.failed","error":{"message":"You've hit your usage limit."}}"#]);
    assert_eq!(out[0]["is_error"], true);
    assert_eq!(out[0]["result"], "You've hit your usage limit.");

    let (_, mut t) = run(&[r#"{"type":"turn.started"}"#, r#"{"type":"error","message":"stream disconnected"}"#]);
    assert_eq!(t.failure(Some("ignored".into()))["result"], "Codex stopped: stream disconnected");
    let mut t = Translator::new("m".into());
    assert_eq!(t.failure(None)["result"], "Codex stopped before it replied.");
  }

  #[test]
  fn reads_the_login_method_without_keeping_anything_else() {
    assert_eq!(login_method("Logged in using ChatGPT"), Some("chatgpt"));
    assert_eq!(login_method("Logged in using an API key - sk-proj-***abcd"), Some("api-key"));
    assert_eq!(login_method("Not logged in"), None);
  }

  #[test]
  fn lists_visible_models_in_order() {
    let catalog = json!({ "models": [
      { "slug": "b", "display_name": "B", "visibility": "list", "priority": 2, "supported_reasoning_levels": [{ "effort": "low" }, { "effort": "high" }] },
      { "slug": "hidden", "visibility": "hide", "priority": 0 },
      { "slug": "a", "display_name": "A", "description": "First", "visibility": "list", "priority": 1, "supported_reasoning_levels": [] },
    ] });
    let models = catalog_models(&catalog);
    assert_eq!(models[0]["value"], "a");
    assert_eq!(models[0]["supportsEffort"], false);
    assert_eq!(models[1]["supportedEffortLevels"], json!(["low", "high"]));
    assert_eq!(models.as_array().unwrap().len(), 2);
  }

  #[test]
  fn resumes_by_thread_and_reads_the_prompt_from_stdin() {
    let s = CodexSession::new("codex".into(), ".".into(), None, Some("gpt-6-luna".into()), Some("low".into()), "Say \"hi\"\nthen stop", Arc::new(|_| {}));
    let first = s.args(None);
    assert_eq!(&first[..2], ["exec", "--json"]);
    assert_eq!(first.last().unwrap(), "-");
    assert!(first.contains(&"--ignore-user-config".to_string()));
    assert!(first.contains(&r#"developer_instructions="Say \"hi\"\nthen stop""#.to_string()));
    assert!(first.contains(&r#"model_reasoning_effort="low""#.to_string()));
    let again = s.args(Some("t1"));
    assert_eq!(&again[..2], ["exec", "resume"]);
    assert_eq!(&again[again.len() - 2..], ["t1", "-"]);
  }

  /// Sends one real message on the signed-in Codex plan, then a second on the same thread.
  #[test]
  #[ignore = "uses the real Codex CLI and a little plan usage"]
  fn talks_to_codex_on_the_plan_login() {
    let path = find_cli().expect("codex is installed");
    assert!(status().logged_in);
    let models = models(&path).unwrap();
    assert!(models.as_array().is_some_and(|m| !m.is_empty()));
    let cheapest = models.as_array().unwrap().iter().rev().find_map(|m| m["value"].as_str()).unwrap().to_string();

    let (tx, rx) = mpsc::channel::<Value>();
    let tx = Arc::new(Mutex::new(tx));
    let on_batch: OnBatch = Arc::new(move |batch| { for e in batch { let _ = tx.lock().unwrap().send(e); } });
    let session = CodexSession::new(path, std::env::temp_dir(), None, Some(cheapest), Some("low".into()), "You are a test. Answer in one word. Never call a tool.", on_batch);
    let result = |rx: &mpsc::Receiver<Value>| loop {
      let event = rx.recv_timeout(Duration::from_secs(120)).expect("an event");
      if event["type"] == "result" { break event; }
    };
    session.send("Reply with the single word: ready").unwrap();
    let first = result(&rx);
    assert_eq!(first["is_error"], false, "{first}");
    assert!(session.thread.lock().unwrap().is_some());

    session.send("What word did I ask you to reply with? Answer with that word only.").unwrap();
    let mut text = String::new();
    let second = loop {
      let event = rx.recv_timeout(Duration::from_secs(120)).expect("an event");
      if let Some(t) = event["event"]["delta"]["text"].as_str() { text.push_str(t); }
      if event["type"] == "result" { break event; }
    };
    assert_eq!(second["is_error"], false, "{second}");
    assert!(text.to_lowercase().contains("ready"), "{text}");
  }
}
