import {syntaxTree, tokenClassNodeProp} from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { FileView, MarkdownPostProcessorContext } from 'obsidian';
import { attachComponent } from './componentRendering';

export function getLivePostprocessor() {
    class JsxWidget extends WidgetType {
        constructor(public el: HTMLElement, public code: string) {
            super();
        }
        toDOM(): HTMLElement {
            return this.el;
        }
        eq(other: JsxWidget) {
            return other.code === this.code;
        }
        ignoreEvent() {
            return false;
        }
        destroy(): void {
            return;
        }
    }

    class LivePlugin {
        decorations: DecorationSet;
        selectedDecorations: Set<Decoration>;
        view: EditorView;
        constructor(view: EditorView) {
            this.view = view;
            this.build(view);
        }
        update(update: ViewUpdate) {
            this.view = update.view;
            if (update.docChanged || update.viewportChanged) {
                //rebuild
                this.build(update.view);
            }
        }
        destroy(): void {
            return void 0;
        }
        build(view: EditorView) {
            try {
                const builder = new RangeSetBuilder<Decoration>();
                const createJsxDecoration = (code, from, to, isBlock = false) => {
                    const el = document.createElement('span');
                    attachComponent(code, el, ctx);

                    const deco = Decoration.widget({
                        widget: new JsxWidget(el, code),
                        block: false, //isBlock // can't register block decorations with plugins :(
                        from,
                        to
                    });

                    if (!isBlock) {
                        builder.add(Math.max(0, from - 1), Math.max(0, to + 1), Decoration.replace({}));
                    }
                    builder.add(to + 1, to + 1, deco);
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const leaf: FileView = Object.keys((view.state as any).config.address)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map(x => (view.state as any).field({ id: x }))
                    .filter(x => x?.file)[0];
                const ctx: MarkdownPostProcessorContext = {
                    docId: null,
                    sourcePath: leaf?.file?.path || '',
                    frontmatter: null,
                    addChild: null,
                    getSectionInfo: null
                };

                let codeblockStart: { from: number; to: number; strippedCodeblockHeader: string };

                for (const { from, to } of view.visibleRanges) {
                    view.state.selection.ranges.map(r => r.from);
                    syntaxTree(view.state).iterate({
                        from,
                        to,
                        enter: (node) => {
                            const tokens = node.type.prop<string>(tokenClassNodeProp);
                            const props = new Set(tokens?.split(' '));
                            const propNames = new Set(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                Object.values((node.type as any).props || {})
                                    .filter(x => typeof x === 'string')
                                    .flatMap((x: string) => x.split(' '))
                            );
                            if (propNames.has('HyperMD-codeblock-begin')) {
                                const codeblockHeader = view.state.doc.sliceString(node.from, node.to);
                                const strippedCodeblockHeader = /^`*(.*)/gm.exec(codeblockHeader)?.[1]?.trim();
                                if (!strippedCodeblockHeader) return;
                                if (
                                    strippedCodeblockHeader.startsWith('jsx:') ||
                                    strippedCodeblockHeader.startsWith('jsx-') ||
                                    strippedCodeblockHeader == 'jsx'
                                ) {
                                    codeblockStart = { from, to, strippedCodeblockHeader };
                                }
                                return;
                            }
                            if (propNames.has('HyperMD-codeblock-end') && codeblockStart) {
                                const code = view.state.doc.sliceString(codeblockStart.to, node.from)?.trim();
                                if (
                                    codeblockStart.strippedCodeblockHeader == 'jsx:' ||
                                    codeblockStart.strippedCodeblockHeader == 'jsx-'
                                ) {
                                    createJsxDecoration(code, codeblockStart.from, node.to, true);
                                } else if (codeblockStart.strippedCodeblockHeader.startsWith('jsx::')) {
                                    const componentName = codeblockStart.strippedCodeblockHeader
                                        .substr('jsx::'.length)
                                        .trim();
                                    const source = `<${componentName} src={${JSON.stringify(code)}}/>`;
                                    createJsxDecoration(source, codeblockStart.from, node.to, true);
                                } else if (codeblockStart.strippedCodeblockHeader.startsWith('jsx')) {
                                    const source = `<Markdown src={${JSON.stringify('```tsx\n' + code + '\n```')}}/>`;
                                    createJsxDecoration(source, codeblockStart.from, node.to, true);
                                }
                                codeblockStart = null;
                            }
                            if (!props.has('inline-code')) return;
                            if (props.has('formatting')) return;
                            const line = view.state.doc.sliceString(from, to);
                            if (!/^jsx:/.test(line)) return;

                            const [, code] = line.match(/^jsx:\s?(.+)/) ?? [];
                            if (!code?.trim().length) return;
                            createJsxDecoration(code, from, to);
                        }
                    });
                }
                this.decorations = builder.finish();
            } catch (e) {
                debugger;
            }
        }
    }

    return ViewPlugin.fromClass(LivePlugin, {
        decorations: v => {
            return v.decorations.update({
                filter: (from, to) =>
                    from == to ||
                    !v.view.state.selection.ranges.filter(r => (r.from < from ? r.to > from : r.from < to)).length
            });
        }
    });
}
