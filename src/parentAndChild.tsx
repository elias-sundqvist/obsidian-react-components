export type ParentAndChild = { parent: HTMLElement; child: HTMLElement };
export type WeakParentAndChild = { parent: WeakRef<HTMLElement>; child: WeakRef<HTMLElement> };

export const asWeak = (parentAndChild: ParentAndChild) => ({
    parent: new WeakRef(parentAndChild.parent),
    child: new WeakRef(parentAndChild.child)
});
export const asStrong = (parentAndChild: WeakParentAndChild) => ({
    parent: parentAndChild.parent.deref(),
    child: parentAndChild.child.deref()
});
