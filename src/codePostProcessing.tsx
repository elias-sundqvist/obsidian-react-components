import { getScopeExpression } from './scope';

export function wrapCode(content: string, namespace: string) {
    const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
    const imports = [];
    content = content.replaceAll(importsRegexp, match => {
        imports.push(match.trim());
        return '';
    });
    return `${imports.join('\n')}\nexport default scope=>props=>{\n${getScopeExpression(namespace)}\n${content}}`;
}

export function wrapInNoteCode(content: string, namespace: string) {
    const importsRegexp = /^\s*import\s(.|\s)*?\sfrom\s.*?$/gm;
    const imports = [];
    content = content.replaceAll(importsRegexp, match => {
        imports.push(match.trim());
        return '';
    });
    return `${imports.join('\n')}\nexport default (scope, transpile)=>{\n${getScopeExpression(
        namespace
    )}\n return eval(transpile(JSON.parse(${JSON.stringify(JSON.stringify(content))})))}`;
}

export function removeFrontMatter(stringWithFrontMatter: string): string {
    return stringWithFrontMatter.replace(/^---$(.|\r?\n)+?^---$\r?\n/gm, '');
}
