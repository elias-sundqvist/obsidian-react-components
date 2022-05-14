import { evalAdapter } from "src/core";
import ReactComponentsPlugin from "src/main";

export const CodeRenderer = ({code, namespace, randomKey}: {code: string, namespace: string, randomKey: number}) => {
    const React = ReactComponentsPlugin.instance.React;
    const [content, setContent] = React.useState(null)
    React.useEffect(()=>{
        (async ()=>{
            const evaluated = await evalAdapter(code,namespace);
            if (typeof evaluated !== 'undefined'){
                setContent(evaluated);
            }
        })()
    }, [randomKey]);
    return content===null?<></>:content;
}