import { Markdown } from './components/Markdown';
import { getNoteHeaderComponent } from './header';
import ReactComponentsPlugin from './main';
import * as obsidian from 'obsidian';
import { getNamespaceObject, NamespaceObject } from './namespaces';
import { CodeBlockSymbol, GLOBAL_NAMESPACE, NamespaceNameSymbol } from './constants';
import isVarName from 'is-var-name';
import { evalAdapter } from './codeEvaluation';
import { transpileCode } from './codeTranspliation';
import { ErrorComponent } from './components/ErrorComponent';

export async function refreshComponentScope() {
    const refreshNamespaceObject = async (namespaceObject: NamespaceObject) => {
        for (const name of Object.keys(namespaceObject)) {
            if (typeof name !== 'string') continue;
            const value = namespaceObject[name];
            if (typeof value === 'function') {
                const codef = namespaceObject[CodeBlockSymbol].get(name);
                try {
                    namespaceObject[name] = await evalAdapter(
                        transpileCode(codef()),
                        namespaceObject[NamespaceNameSymbol]
                    );
                } catch (e) {
                    namespaceObject[name] = () => ErrorComponent({ componentName: name, error: e });
                }
            } else {
                await refreshNamespaceObject(value);
            }
        }
    };
    await refreshNamespaceObject(ReactComponentsPlugin.instance.namespaceRoot);
}

export function getScope(namespace: string) {
    const React = ReactComponentsPlugin.instance.React;
    const ReactDOM = ReactComponentsPlugin.instance.ReactDOM;
    const { useState, useEffect, useContext, useCallback, useMemo, useReducer, useRef } = React;
    const useIsPreview = () => {
        const ctx = useContext(ReactComponentsPlugin.instance.ReactComponentContext);
        return (
            ctx.markdownPostProcessorContext.containerEl
                .closest('.workspace-leaf-content')
                .getAttribute('data-mode') === 'preview'
        );
    };

    const scope = {
        Markdown: Markdown,
        ReactComponentContext: ReactComponentsPlugin.instance.ReactComponentContext,
        pluginInternalNoteHeaderComponent: getNoteHeaderComponent(),
        React,
        ReactDOM,
        useState,
        useEffect,
        useCallback,
        useContext,
        useMemo,
        useReducer,
        useRef,
        useIsPreview,
        obsidian
    };

    // Prevent stale component references
    const addDynamicReferences = (namespaceObject: NamespaceObject) => {
        for (const componentName of Object.keys(namespaceObject)) {
            if (scope[componentName] || !isVarName(componentName)) continue;
            Object.defineProperty(scope, componentName, {
                get: function () {
                    return namespaceObject[componentName];
                },
                enumerable: true
            });
        }
    };

    addDynamicReferences(getNamespaceObject(namespace));
    addDynamicReferences(getNamespaceObject(GLOBAL_NAMESPACE));
    addDynamicReferences(ReactComponentsPlugin.instance.namespaceRoot);

    return scope;
}

export function getScopeExpression(namespace: string) {
    const scope = getScope(namespace);
    return (
        Object.keys(scope)
            .sort()
            .map(k => `let ${k}=scope.${k};`)
            .join('\n') + '\n'
    );
}
