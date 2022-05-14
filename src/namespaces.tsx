import { CodeBlockSymbol, NamespaceNameSymbol } from './constants';
import ReactComponentsPlugin from './main';

export type NamespaceObject = {
    [k: string]: NamespaceObject | ((any) => JSX.Element);
    [CodeBlockSymbol]?: Map<string, () => string> | null;
    [NamespaceNameSymbol]?: string;
};

export function getNamespaceObject(namespace: string): NamespaceObject {
    let namespaceObject = ReactComponentsPlugin.instance.namespaceRoot;
    namespace
        .trim()
        .split('.')
        .forEach(c => {
            let next = namespaceObject?.[c.trim()];
            if (typeof next == 'function') {
                namespaceObject = null;
            } else if (next) {
                namespaceObject = next;
            } else {
                next = {} as NamespaceObject;
                namespaceObject[c.trim()] = next;
                namespaceObject = next;
            }
        });
    if (!namespaceObject[CodeBlockSymbol]) {
        namespaceObject[CodeBlockSymbol] = new Map();
        namespaceObject[NamespaceNameSymbol] = namespace;
    }
    return namespaceObject;
}

export function clearComponentNamespace() {
    ReactComponentsPlugin.instance.namespaceRoot = {};
}
