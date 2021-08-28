import "obsidian";

declare module "obsidian" {
  interface Workspace {
    on(name: 'react-components:component-updated', callback: () => void): EventRef;
  }

  interface MarkdownPostProcessorContext {
      containerEl?: HTMLElement;
  }

  interface MetadataCache {
    on(
      name: "dataview:metadata-change",
      callback: (
        ...args:
          | [op: "rename", file: TAbstractFile, oldPath: string]
          | [op: "delete", file: TFile]
          | [op: "update", file: TFile]
      ) => unknown,
      ctx?: unknown
    ): EventRef;
  }
}