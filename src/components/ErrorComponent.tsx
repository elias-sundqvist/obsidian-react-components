import ReactComponentsPlugin from '../main';
export const ErrorComponent = ({ componentName, error }: { componentName: string; error: Error }) => {
    const React = ReactComponentsPlugin.instance.React;
    return (
        <span style={{ color: 'red' }}>
            {`Error in component "${componentName}": ${error.toString()}`}
            <button
                onClick={() =>
                    setTimeout(() => {
                        throw error;
                    }, 1)
                }
            >
                Show In Console
            </button>
        </span>
    );
};
