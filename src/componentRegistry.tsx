import { normalizePath, Notice, TFile } from 'obsidian';
import { CodeBlockSymbol, GLOBAL_NAMESPACE } from './constants';
import { getPropertyValue } from './fileUtils';
import ReactComponentsPlugin from './main';
import { getMatches } from './regex_utils';
import isVarName from 'is-var-name';
import { getNamespaceObject } from './namespaces';
import { evalAdapter } from './codeEvaluation';
import { transpileCode } from './codeTranspliation';
import { ErrorComponent } from './components/ErrorComponent';
import { getNoteHeaderComponent, setNoteHeaderComponent } from './header';
import { removeFrontMatter, wrapCode } from './codePostProcessing';
import { refreshComponentScope } from './scope';
import { requestComponentUpdate } from './componentRendering';

export async function registerComponent(
    content: string,
    componentName: string,
    componentNamespace,
    suppressComponentRefresh
) {
    const code = () => wrapCode(content, componentNamespace);

    const codeString = code();
    const namespaceObject = getNamespaceObject(componentNamespace);
    const codeBlocks = namespaceObject[CodeBlockSymbol];
    if (!(codeBlocks.has(componentName) && codeBlocks.get(componentName)() == codeString)) {
        codeBlocks.set(componentName, code);
        await refreshComponentScope();
        if (ReactComponentsPlugin.instance.settings.auto_refresh && !suppressComponentRefresh) {
            requestComponentUpdate();
        }
    }
    try {
        namespaceObject[componentName] = await evalAdapter(
            transpileCode(namespaceObject[CodeBlockSymbol].get(componentName)()),
            componentNamespace
        );
    } catch (e) {
        namespaceObject[componentName] = () => ErrorComponent({ componentName, error: e });
    }
}

export async function registerComponents(file: TFile, suppressComponentRefresh = false) {
    if (file.path.startsWith(normalizePath(ReactComponentsPlugin.instance.settings.template_folder))) {
        await registerFullFileComponent(file, suppressComponentRefresh);
    } else if (file.extension == 'md' && getPropertyValue('defines-react-components', file)) {
        await registerCodeBlockComponents(file, suppressComponentRefresh);
    }
}

export async function registerCodeBlockComponents(file: TFile, suppressComponentRefresh = false) {
    const content = await ReactComponentsPlugin.instance.app.vault.read(file);
    const nameSpace = getPropertyValue('react-components-namespace', file) || GLOBAL_NAMESPACE;

    const matches = getMatches(/^\s*?```jsx:component:(.*)\r?\n((.|\r?\n)*?)\r?\n^\s*?```$/gm, content);

    for (const match of matches) {
        const [componentName] = match[1].split(':').map(x => x.trim());
        if (!isVarName(componentName)) continue;
        const componentCode = match[2];
        await registerComponent(componentCode, componentName, nameSpace, suppressComponentRefresh);
    }
}

export async function registerFullFileComponent(file: TFile, suppressComponentRefresh = false) {
    if (!['md', 'jsx', 'tsx'].contains(file.extension)) {
        new Notice(`"${file.basename}.${file.extension}" is not a valid extension`);
        return;
    }

    if (!isVarName(file.basename)) {
        new Notice(`"${file.basename}" is not a valid function name`);
        return;
    }

    let content = await ReactComponentsPlugin.instance.app.vault.read(file);
    content = removeFrontMatter(content);

    const namespace = GLOBAL_NAMESPACE;

    await registerComponent(content, file.basename, namespace, suppressComponentRefresh);

    const namespaceObject = getNamespaceObject(namespace);

    const useAsNoteHeaderPropertyValue = getPropertyValue('use-as-note-header', file);
    if (useAsNoteHeaderPropertyValue) {
        const newNoteHeaderComponent = namespaceObject[file.basename];
        if (getNoteHeaderComponent() != newNoteHeaderComponent && typeof newNoteHeaderComponent == 'function') {
            setNoteHeaderComponent(newNoteHeaderComponent);
            requestComponentUpdate();
        }
    }
}
