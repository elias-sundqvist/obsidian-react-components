export function getMatches(regex: RegExp, str: string) {
    let m: RegExpExecArray;
    const res: RegExpExecArray[] = [];
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        res.push(m);
    }
    return res;
}
