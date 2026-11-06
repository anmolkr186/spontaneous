//! Hosts the user's own Claude Code CLI as a child process.
//!
//! Sign-in belongs to the CLI: it runs Anthropic's browser flow and keeps the
//! login in the Keychain. This module never sees or stores a credential. It
//! only starts `claude`, writes stream-json to stdin and forwards stdout.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

/// These would outrank the plan login, and in `-p` mode an API key is used
/// without asking, so a stray key in the environment would bill the key. The
/// CLAUDECODE variables make a nested CLI think it runs inside another session.
const BLOCKED_ENV: &[&str] = &[
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
];

/// The agent has no tools: it brings up components with UI blocks in its replies,
/// and edits only through plans the person runs. Generated from the agent UI
/// catalog by `npm run docs:agent-ui`; never edit the text file by hand.
const SYSTEM_PROMPT: &str = include_str!("agent_prompt.txt");

/// Every Claude Code release is published to npm, however it was installed.
const RELEASES_URL: &str = "https://registry.npmjs.org/@anthropic-ai/claude-code/latest";
/// A download, and for npm installs a full dependency install.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(300);

const BATCH_INTERVAL: Duration = Duration::from_millis(16);
const STOP_GRACE: Duration = Duration::from_secs(2);
const STDERR_LINES: usize = 20;

#[derive(Default)]
pub struct AgentState {
  session: Mutex<Option<Session>>,
  login: Mutex<Option<Child>>,
}

struct Session {
  child: Child,
  stdin: ChildStdin,
}

/// How to start a session. Each is left to the CLI's default when absent.
#[derive(Debug, Default, Deserialize)]
pub struct SessionOptions {
  /// An earlier conversation to continue.
  resume: Option<String>,
  model: Option<String>,
  effort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
  installed: bool,
  version: Option<String>,
  logged_in: bool,
  subscription: Option<String>,
}

/// Apps opened from Finder don't inherit the shell's PATH, so check the usual
/// install locations first and fall back to asking the login shell.
fn find_cli() -> Option<PathBuf> {
  let home = std::env::var("HOME").unwrap_or_default();
  let known = [
    format!("{home}/.local/bin/claude"),
    format!("{home}/.claude/local/claude"),
    "/opt/homebrew/bin/claude".to_string(),
    "/usr/local/bin/claude".to_string(),
  ];
  if let Some(path) = known.iter().map(PathBuf::from).find(|p| p.is_file()) {
    return Some(path);
  }
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
  let output = Command::new(shell).args(["-ilc", "command -v claude"]).stdin(Stdio::null()).output().ok()?;
  let found = String::from_utf8_lossy(&output.stdout);
  found.lines().last().map(PathBuf::from).filter(|p| p.is_file())
}

fn cli(path: &Path) -> Command {
  let mut command = Command::new(path);
  for name in BLOCKED_ENV {
    command.env_remove(name);
  }
  command
}

fn status() -> AgentStatus {
  let Some(path) = find_cli() else {
    return AgentStatus { installed: false, version: None, logged_in: false, subscription: None };
  };
  let version = cli(&path).arg("--version").stdin(Stdio::null()).output().ok()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .filter(|v| !v.is_empty());
  let auth = cli(&path).args(["auth", "status"]).stdin(Stdio::null()).output().ok()
    .and_then(|o| serde_json::from_slice::<Value>(&o.stdout).ok())
    .unwrap_or(Value::Null);
  AgentStatus {
    installed: true,
    version,
    logged_in: auth["loggedIn"].as_bool().unwrap_or(false),
    subscription: auth["subscriptionType"].as_str().map(str::to_string),
  }
}

/// Without `--tools ""` the CLI has its file and shell tools: `--allowedTools`
/// only pre-approves. The empty setting sources and strict MCP config keep hooks
/// and servers from the user's own config out of this process. The system prompt
/// and session stay plain `-p`, never `--bare`, which doesn't read the plan login.
fn session_args(options: &SessionOptions) -> Vec<String> {
  let mut args: Vec<String> = [
    "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    "--include-partial-messages", "--tools", "", "--strict-mcp-config", "--setting-sources", "",
    "--append-system-prompt", SYSTEM_PROMPT,
  ].map(str::to_string).into();
  for (flag, value) in [("--resume", &options.resume), ("--model", &options.model), ("--effort", &options.effort)] {
    if let Some(value) = value {
      args.extend([flag.to_string(), value.clone()]);
    }
  }
  args
}

/// Starts the CLI and forwards its stdout as batches, ending with one
/// `agent_exit` event that carries the tail of stderr.
fn spawn_session(path: &Path, cwd: &Path, options: &SessionOptions, mut on_batch: impl FnMut(Vec<Value>) + Send + 'static) -> Result<Session, String> {
  let mut child = cli(path)
    .args(session_args(options))
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("Couldn't start Claude Code: {e}"))?;
  let stdin = child.stdin.take().ok_or("Claude Code has no stdin")?;
  let stdout = child.stdout.take().ok_or("Claude Code has no stdout")?;
  let stderr = child.stderr.take().ok_or("Claude Code has no stderr")?;

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

  let (tx, rx) = mpsc::channel::<Value>();
  std::thread::spawn(move || {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      if let Ok(event) = serde_json::from_str::<Value>(&line) {
        if tx.send(event).is_err() {
          break;
        }
      }
    }
  });
  std::thread::spawn(move || {
    while let Ok(first) = rx.recv() {
      std::thread::sleep(BATCH_INTERVAL);
      let mut batch = vec![first];
      batch.extend(rx.try_iter());
      on_batch(batch);
    }
    let stderr = tail.lock().unwrap().join("\n");
    on_batch(vec![json!({ "type": "agent_exit", "stderr": stderr })]);
  });
  Ok(Session { child, stdin })
}

fn write_message(session: &mut Session, text: &str) -> Result<(), String> {
  let message = json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": text }] } });
  writeln!(session.stdin, "{message}").and_then(|_| session.stdin.flush()).map_err(|e| format!("Couldn't reach Claude Code: {e}"))
}

/// SIGINT ends the turn cleanly, so the session can be resumed; kill it only if it doesn't exit.
fn stop_session(mut session: Session) {
  let _ = Command::new("kill").args(["-INT", &session.child.id().to_string()]).status();
  drop(session.stdin);
  let deadline = Instant::now() + STOP_GRACE;
  while Instant::now() < deadline {
    if matches!(session.child.try_wait(), Ok(Some(_))) {
      return;
    }
    std::thread::sleep(Duration::from_millis(50));
  }
  let _ = session.child.kill();
  let _ = session.child.wait();
}

#[tauri::command]
pub async fn agent_status() -> Result<AgentStatus, String> {
  tauri::async_runtime::spawn_blocking(status).await.map_err(|e| e.to_string())
}

/// Runs the CLI's own sign-in, which opens Anthropic's page in the browser.
/// Resolves when that finishes; a second call replaces a sign-in left waiting.
#[tauri::command]
pub async fn agent_login(app: AppHandle) -> Result<(), String> {
  let path = find_cli().ok_or("Claude Code isn't installed")?;
  let mut child = cli(&path)
    .args(["auth", "login", "--claudeai"])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("Couldn't start sign-in: {e}"))?;
  let previous = app.state::<AgentState>().login.lock().unwrap().take();
  if let Some(mut previous) = previous {
    let _ = previous.kill();
    let _ = previous.wait();
  }
  let pid = child.id();
  if let Ok(Some(status)) = child.try_wait() {
    return if status.success() { Ok(()) } else { Err("Sign-in didn't finish".into()) };
  }
  *app.state::<AgentState>().login.lock().unwrap() = Some(child);
  tauri::async_runtime::spawn_blocking(move || loop {
    std::thread::sleep(Duration::from_millis(250));
    let state = app.state::<AgentState>();
    let mut login = state.login.lock().unwrap();
    match login.as_mut().filter(|c| c.id() == pid).map(Child::try_wait) {
      Some(Ok(None)) => {}
      Some(Ok(Some(status))) => {
        *login = None;
        return if status.success() { Ok(()) } else { Err("Sign-in didn't finish".to_string()) };
      }
      Some(Err(e)) => return Err(e.to_string()),
      // Replaced by a newer sign-in.
      None => return Ok(()),
    }
  }).await.map_err(|e| e.to_string())?
}

/// Starts a session, replacing any running one.
#[tauri::command]
pub async fn agent_connect(app: AppHandle, state: State<'_, AgentState>, options: SessionOptions, on_event: Channel<Vec<Value>>) -> Result<(), String> {
  let path = find_cli().ok_or("Claude Code isn't installed")?;
  let cwd = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent");
  std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
  let session = spawn_session(&path, &cwd, &options, move |batch| { let _ = on_event.send(batch); })?;
  let previous = state.session.lock().unwrap().replace(session);
  if let Some(previous) = previous {
    std::thread::spawn(move || stop_session(previous));
  }
  Ok(())
}

#[tauri::command]
pub fn agent_send(state: State<'_, AgentState>, text: String) -> Result<(), String> {
  let mut session = state.session.lock().unwrap();
  write_message(session.as_mut().ok_or("Claude Code isn't running")?, &text)
}

#[tauri::command]
pub fn agent_stop(state: State<'_, AgentState>) {
  if let Some(session) = state.session.lock().unwrap().take() {
    std::thread::spawn(move || stop_session(session));
  }
}

/// How long the CLI gets to answer the model question before the probe gives up.
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

/// Asks the installed CLI which models and effort levels it supports, through
/// the `initialize` request the Agent SDK sends. It makes no model request, so
/// it costs nothing, and new models appear without an app update.
fn probe_models(path: &Path, cwd: &Path) -> Result<Value, String> {
  let mut child = cli(path)
    .args([
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
    ])
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("Couldn't start Claude Code: {e}"))?;
  let mut stdin = child.stdin.take().ok_or("Claude Code has no stdin")?;
  let stdout = child.stdout.take().ok_or("Claude Code has no stdout")?;
  let request = json!({ "type": "control_request", "request_id": "models", "request": { "subtype": "initialize" } });
  writeln!(stdin, "{request}").and_then(|_| stdin.flush()).map_err(|e| e.to_string())?;

  let (tx, rx) = mpsc::channel::<Value>();
  std::thread::spawn(move || {
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
      let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
      if event["type"] == "control_response" && event["response"]["request_id"] == "models" {
        let _ = tx.send(event["response"]["response"]["models"].clone());
        break;
      }
    }
  });
  let models = rx.recv_timeout(PROBE_TIMEOUT);
  drop(stdin);
  let _ = child.kill();
  let _ = child.wait();
  match models {
    Ok(models) if models.is_array() => Ok(models),
    Ok(_) => Err("This Claude Code doesn't list its models".to_string()),
    Err(_) => Err("Claude Code didn't answer in time".to_string()),
  }
}

#[tauri::command]
pub async fn agent_models(app: AppHandle) -> Result<Value, String> {
  let path = find_cli().ok_or("Claude Code isn't installed")?;
  let cwd = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent");
  std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
  tauri::async_runtime::spawn_blocking(move || probe_models(&path, &cwd)).await.map_err(|e| e.to_string())?
}

/// The newest Claude Code on npm. Fetched with the system curl, so the app needs no HTTP client.
#[tauri::command]
pub async fn agent_latest_version() -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let output = Command::new("/usr/bin/curl")
      .args(["-fsSL", "--max-time", "10", "-A", "Spontaneous", "-H", "Accept: application/json", RELEASES_URL])
      .stdin(Stdio::null())
      .output()
      .map_err(|e| e.to_string())?;
    if !output.status.success() {
      return Err("Couldn't reach the npm registry".to_string());
    }
    let body: Value = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    latest_version(&body).ok_or_else(|| "The npm registry returned no version".to_string())
  }).await.map_err(|e| e.to_string())?
}

fn latest_version(body: &Value) -> Option<String> {
  body["version"].as_str().map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

/// Runs the CLI's own updater, which knows whether it came from the native
/// installer, npm or Homebrew. stdin is closed, so an updater that stops to ask
/// fails instead of hanging. Exiting cleanly doesn't prove it installed
/// anything, so the caller checks the version afterwards.
#[tauri::command]
pub async fn agent_update() -> Result<(), String> {
  let path = find_cli().ok_or("Claude Code isn't installed")?;
  tauri::async_runtime::spawn_blocking(move || {
    let child = cli(&path)
      .arg("update")
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("Couldn't start the update: {e}"))?;
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || { let _ = tx.send(child.wait_with_output()); });
    match rx.recv_timeout(UPDATE_TIMEOUT) {
      Ok(Ok(output)) if output.status.success() => Ok(()),
      Ok(Ok(output)) => Err(update_failure(&output.stdout, &output.stderr)),
      Ok(Err(e)) => Err(e.to_string()),
      Err(_) => {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
        Err("The update took too long and was stopped".to_string())
      }
    }
  }).await.map_err(|e| e.to_string())?
}

/// Updaters print their reason on either stream, and the last line says what went wrong.
fn update_failure(stdout: &[u8], stderr: &[u8]) -> String {
  [stderr, stdout]
    .iter()
    .find_map(|bytes| String::from_utf8_lossy(bytes).lines().map(str::trim).rfind(|l| !l.is_empty()).map(str::to_string))
    .unwrap_or_else(|| "The update failed".to_string())
}

/// A child also exits when its stdin closes, so a crash here can't leave one behind.
pub fn shutdown(app: &AppHandle) {
  let state = app.state::<AgentState>();
  if let Some(session) = state.session.lock().unwrap().take() {
    stop_session(session);
  }
  if let Some(mut login) = state.login.lock().unwrap().take() {
    let _ = login.kill();
    let _ = login.wait();
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn tells_the_agent_every_ui_block() {
    for tool in ["propose_plan", "ask_user", "suggest_shot", "propose_text_edit", "answer_with_moments",
      "request_approval", "request_permission", "try_variants", "reply_to_note"] {
      assert!(SYSTEM_PROMPT.contains(&format!("{tool}:")), "the prompt doesn't describe {tool}");
    }
    assert!(SYSTEM_PROMPT.contains("```spontaneous"));
  }

  #[test]
  #[ignore = "uses the real CLI"]
  fn lists_models_with_their_effort_levels() {
    let models = probe_models(&find_cli().expect("claude is installed"), &std::env::temp_dir()).unwrap();
    let models = models.as_array().unwrap();
    assert!(models.iter().any(|m| m["value"] == "default"));
    assert!(models.iter().all(|m| m["displayName"].is_string()));
    assert!(models.iter().any(|m| m["supportedEffortLevels"].as_array().is_some_and(|l| !l.is_empty())));
  }

  #[test]
  fn reads_the_version_from_the_registry() {
    assert_eq!(latest_version(&json!({ "name": "@anthropic-ai/claude-code", "version": "2.1.318" })), Some("2.1.318".into()));
    assert_eq!(latest_version(&json!({ "version": " " })), None);
    assert_eq!(latest_version(&json!({})), None);
  }

  #[test]
  fn reports_the_last_line_an_updater_printed() {
    assert_eq!(update_failure(b"checking\n", b"npm ERR! code EACCES\nnpm ERR! permission denied\n\n"), "npm ERR! permission denied");
    assert_eq!(update_failure(b"no write access\n", b""), "no write access");
    assert_eq!(update_failure(b"", b""), "The update failed");
  }

  /// Sends one real message on the signed-in plan. Run with `cargo test -p spontaneous --lib agent -- --ignored`.
  #[test]
  #[ignore = "uses the real CLI and a little plan usage"]
  fn talks_to_the_cli_on_the_plan_login() {
    let path = find_cli().expect("claude is installed");
    assert!(status().logged_in);
    let cwd = std::env::temp_dir();
    let (tx, rx) = mpsc::channel::<Value>();
    let options = SessionOptions { model: Some("haiku".into()), effort: Some("low".into()), ..Default::default() };
    let mut session = spawn_session(&path, &cwd, &options, move |batch| {
      for event in batch {
        let _ = tx.send(event);
      }
    }).unwrap();
    write_message(&mut session, "Reply with the single word: ready").unwrap();

    let mut init = None;
    let mut result = None;
    while result.is_none() {
      let event = rx.recv_timeout(Duration::from_secs(60)).expect("an event");
      match (event["type"].as_str(), event["subtype"].as_str()) {
        (Some("system"), Some("init")) => init = Some(event),
        (Some("result"), _) => result = Some(event),
        (Some("agent_exit"), _) => panic!("exited early: {event}"),
        _ => {}
      }
    }
    let init = init.expect("an init event");
    assert_eq!(init["apiKeySource"], "none");
    assert!(init["model"].as_str().unwrap().contains("haiku"));
    assert_eq!(init["tools"], json!([]));
    assert_eq!(result.unwrap()["is_error"], false);

    // A changed model comes from restarting on the same conversation.
    let session_id = init["session_id"].as_str().unwrap().to_string();
    stop_session(session);
    let (tx, rx) = mpsc::channel::<Value>();
    let options = SessionOptions { resume: Some(session_id.clone()), model: Some("sonnet".into()), effort: Some("low".into()) };
    let mut session = spawn_session(&path, &cwd, &options, move |batch| {
      for event in batch {
        let _ = tx.send(event);
      }
    }).unwrap();
    write_message(&mut session, "What word did I ask you to reply with? Answer with that word only.").unwrap();
    let mut init = None;
    let mut result = None;
    while result.is_none() {
      let event = rx.recv_timeout(Duration::from_secs(60)).expect("an event");
      match (event["type"].as_str(), event["subtype"].as_str()) {
        (Some("system"), Some("init")) => init = Some(event),
        (Some("result"), _) => result = Some(event),
        (Some("agent_exit"), _) => panic!("exited early: {event}"),
        _ => {}
      }
    }
    assert!(init.unwrap()["model"].as_str().unwrap().contains("sonnet"));
    assert!(result.unwrap()["result"].as_str().unwrap().to_lowercase().contains("ready"));

    stop_session(session);
    let exited = std::iter::from_fn(|| rx.recv_timeout(Duration::from_secs(5)).ok()).any(|e| e["type"] == "agent_exit");
    assert!(exited);
  }
}
