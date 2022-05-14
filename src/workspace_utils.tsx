import ReactComponentsPlugin from './main';

export function refreshPanes() {
    ReactComponentsPlugin.instance.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
        if (leaf.getViewState().state.mode.includes('preview'))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (leaf.view as any).previewMode.rerender(true);
    });
}
