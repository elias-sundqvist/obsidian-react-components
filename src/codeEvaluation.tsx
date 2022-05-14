import { transpileCode } from './codeTranspliation';
import { ErrorComponent } from './components/ErrorComponent';
import { getScope } from './scope';
import { importFromUrl } from './urlImport';

// evaluated code inherits the scope of the current function
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function evalAdapter(code: string, namespace: string) {
    const scope = getScope(namespace);
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    let evaluated = null;
    try {
        evaluated = (await importFromUrl(encodedCode)).default(scope, transpileCode);
    } catch (e) {
        return ErrorComponent({ componentName: 'evaluated code', error: e });
    }

    if (typeof evaluated == 'function') {
        return (...args) => {
            try {
                return evaluated(...args);
            } catch (e) {
                return ErrorComponent({ componentName: 'evaluated code', error: e });
            }
        };
    } else {
        return evaluated;
    }
}
