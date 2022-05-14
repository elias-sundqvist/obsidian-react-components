export function importFromUrl(url: string): Promise<{ default }> {
    const importf = eval(`x=>import(x)`);
    return importf(url);
}
