import { normalizePath, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import ReactComponentsPlugin from './main';

export function getTFilesFromFolder(plugin: ReactComponentsPlugin, folder_str: string): Array<TFile> {
    folder_str = normalizePath(folder_str);

    const folder = plugin.app.vault.getAbstractFileByPath(folder_str);
    if (!folder) {
        throw new Error(`${folder_str} folder doesn't exist`);
    }
    if (!(folder instanceof TFolder)) {
        throw new Error(`${folder_str} is a file, not a folder`);
    }

    const files: Array<TFile> = [];
    Vault.recurseChildren(folder, (file: TAbstractFile) => {
        if (file instanceof TFile) {
            files.push(file);
        }
    });

    files.sort((a, b) => {
        return a.basename.localeCompare(b.basename);
    });

    return files;
}

export function getPropertyValue(propertyName: string, file: TFile) {
    const app = ReactComponentsPlugin.instance.app;
    let dataViewPropertyValue = null;
    try {
        dataViewPropertyValue = (app as any)?.plugins?.plugins?.dataview?.api // eslint-disable-line
            ?.page(file?.path)?.[propertyName];
        if (dataViewPropertyValue) {
            if (dataViewPropertyValue.path) {
                return app.metadataCache.getFirstLinkpathDest(dataViewPropertyValue?.path, file?.path)?.path;
            }
            const externalLinkMatch = /^\[.*\]\((.*)\)$/gm.exec(dataViewPropertyValue)?.[1];
            if (externalLinkMatch) {
                return externalLinkMatch;
            }
            return dataViewPropertyValue;
        } else {
            const cache = app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.[propertyName];
        }
    } catch (e) {}
}

export async function awaitFilesLoaded() {
    const app = ReactComponentsPlugin.instance.app;
    let len: number;
    do {
        len = app.vault.getAllLoadedFiles().length;
        await new Promise(r => setTimeout(r, 500));
    } while (len != app.vault.getAllLoadedFiles().length);
}
