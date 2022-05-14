import Babel from '@babel/standalone';
export function transpileCode(content: string) {
    return Babel.transform(content, {
        presets: [
            Babel.availablePresets['react'],
            [
                Babel.availablePresets['typescript'],
                {
                    onlyRemoveTypeImports: true,
                    allExtensions: true,
                    isTSX: true
                }
            ]
        ]
    }).code;
}
