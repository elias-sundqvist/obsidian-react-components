import { attachComponent } from './core';
import ReactComponentsPlugin from './main';

export function registerCodeProcessor() {
    const plugin = ReactComponentsPlugin.instance;
    plugin.registerMarkdownPostProcessor(async (el, ctx) => {
        const codeblocks = el.querySelectorAll('code');
        const toReplace = [];
        for (let index = 0; index < codeblocks.length; index++) {
            const codeblock = codeblocks.item(index);
            if (codeblock.className == 'language-jsx:' || codeblock.className == 'language-jsx-') {
                const source = codeblock.innerText;
                toReplace.push({ codeblock: codeblock.parentNode, source });
            } else if (codeblock.className.startsWith('language-jsx::')) {
                const componentName = codeblock.className.substr('language-jsx::'.length).trim();
                const source = `<${componentName} src={${JSON.stringify(codeblock.innerText)}}/>`;
                toReplace.push({ codeblock: codeblock.parentNode, source });
            } else {
                const text = codeblock.innerText.trim();
                if (text.startsWith('jsx-') || text.startsWith('jsx:')) {
                    const source = text.substring('jsx-'.length).trim();
                    toReplace.push({ codeblock, source });
                }
            }
        }
        toReplace.forEach(({ codeblock, source }) => {
            const container = document.createElement('span');
            codeblock.replaceWith(container);
            attachComponent(source, container, ctx);
        });
    });
}
