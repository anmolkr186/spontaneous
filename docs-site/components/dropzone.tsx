import { Dropzone } from "@/ui/organisms/dropzone";
import src from "@/ui/organisms/dropzone/index.tsx?raw";
import type { DocEntry } from "../registry";

export const entry: DocEntry = {
  id: "dropzone",
  name: "Dropzone",
  layer: "Organisms",
  category: "Inputs",
  order: 40,
  isNew: true,
  description: "Brings recordings, b-roll and audio into the project: drop files on the well or click it to choose them, then watch each one import with its size, progress and time left. Failed files shake once and offer Retry; finished ones draw a check.",
  demo: () => <div style={{ width: 380, maxWidth: "100%" }}><Dropzone autoplay /></div>,
  usage: `import { Dropzone } from "@/ui/organisms/dropzone";

<Dropzone
  accept={[".mov", ".mp4", ".m4a", ".wav", ".png"]}
  maxSize={2 * 1000 ** 3}
  onUpload={(file, onProgress) => project.importMedia(file, onProgress)}
  onChange={(items) => setImports(items)}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/dropzone/index.tsx",
  props: [
    { name: "accept", type: "string[]", description: "Extensions it takes. Default .mov, .mp4, .m4a, .wav, .png. Other files get a row that says \"Can't import this type\"." },
    { name: "maxSize", type: "number = 2 GB", description: "Largest file in bytes. Bigger files get a \"Larger than 2 GB\" row." },
    { name: "onUpload", type: "(file, onProgress) => Promise<void>", description: "Imports one file and reports progress from 0 to 1. Reject to fail it: the message shows and Retry calls it again. Simulated when left out." },
    { name: "onChange", type: "(items: ImportItem[]) => void", description: "Every change to the list: { id, name, size, kind, status, progress, error?, retryable?, file? }." },
    { name: "hint", type: "string", description: "The line under the title. Defaults to the accepted types and the size limit." },
    { name: "autoplay", type: "boolean = false", description: "Plays a sample drop of four files, one of which fails once. For previews only." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "Well", "Tag", "Fold", "Swap", "RollText", "RollNumber", "DrawCheck", "Key", "IconKey"],
  whenToUse: [
    "Importing footage, b-roll, voiceover and stills into a project, several at once.",
    "When people need to see which files are done, which are still importing and which failed.",
  ],
  whenNot: [
    "Recording new footage. That's the RecorderDock.",
    "One image, like a custom backdrop. A picker with a preview is lighter.",
    "Exports and renders. They run long and in the background: report them with a Toaster (toast.promise).",
  ],
  keyboard: [
    ["Tab", "Reaches the drop area, then Remove and Retry in every row."],
    ["↵ Space", "On the drop area: opens the file picker."],
  ],
  a11y: [
    "The drop area is a button that opens the file picker; it is named by its title and described by the accepted types and size limit.",
    "Every row has a progressbar with its value. Remove and Retry are named after the file (\"Retry Dashboard b-roll.mp4\").",
    "Finished, failed and rejected files are announced once in a polite live region.",
    "Folded-away rows are inert, so focus never lands in a row that is leaving.",
  ],
  motion: [
    "Files hovering the well fan its three film frames out on a no-bounce spring (420ms); hovering with the pointer opens them a little. The dashed ring turns solid and light, and the title rolls to \"Drop 4 files\".",
    "Rows fold open 60ms after each other (grid rows, 380ms) and rise 6px out of a 2px blur.",
    "The bar fills with a light fill in its well; time left counts down in whole seconds; done, a check draws itself.",
    "A failed row gives one short shake and its bar turns danger; Retry starts it again. Removed rows fold away.",
    "Reduced motion: the frames, rows and bars change instantly, no blur, no shake.",
  ],
};
