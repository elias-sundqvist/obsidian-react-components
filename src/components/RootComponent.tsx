import { GLOBAL_NAMESPACE } from 'src/constants';
import { getNamespaceObject } from 'src/namespaces';
import { asStrong, asWeak, ParentAndChild, WeakParentAndChild } from 'src/parentAndChild';
import ReactComponentsPlugin from '../main';

export const RootComponent = () => {
    const plugin = ReactComponentsPlugin.instance; 
    const React = plugin.React;
    const [components, setComponents] = React.useState<WeakParentAndChild[]>([]);
    const [potentialCleanupTargets, setPotentialCleanupTargets] = React.useState<WeakParentAndChild[]>([]);
    
    React.useEffect(()=>{
        // We have two render-passes. Once without the "potentialCleanupTargets" and once with them, 
        // this makes it possible for old components to be garbage collected in the first pass.
        if(potentialCleanupTargets.length>0) {
            setComponents(components=>{
                const newComponents = [...components]
                setPotentialCleanupTargets(potentialCleanupTargets=>{
                    for(const weakPac of potentialCleanupTargets) {
                        const {parent, child} = asStrong(weakPac);
                        if(parent && child) {
                            parent.replaceChildren(child);
                            newComponents.push(weakPac)
                        }
                    }
                    return [];
                });
                return newComponents;
            })
        }
    }, [potentialCleanupTargets.length])

    plugin.updateAllComponents = ()=>{
        setComponents(components=>{
            const newActiveComponents: WeakParentAndChild[] = [];
            const newCleanupTargets: WeakParentAndChild[] = [];
            for(const pac of components) {
                if(pac.parent.deref() && pac.child.deref()) {
                    if(document.body.contains(pac.child.deref())) {
                        newActiveComponents.push(pac);
                    } else {
                        // Detach the child from the parent, allowing the parent to be garbage collected
                        // if obsidian does not have any references to the element. 
                        pac.parent.deref()?.replaceChildren(); 
                        newCleanupTargets.push(pac);
                    }
                    plugin.elementJsxElemMap.set(pac.parent.deref(), plugin.elementJsxFuncMap.get(pac.parent.deref())())
                }
            }
            setPotentialCleanupTargets(potentialCleanupTargets=>[...potentialCleanupTargets, ...newCleanupTargets])
            return newActiveComponents;
        }
        )
    }

    plugin.addComponentToRender = (componentFunc: ()=>React.FunctionComponentElement<any>, parentAndChild: ParentAndChild) =>
        setComponents(components => {
            plugin.elementJsxFuncMap.set(parentAndChild.parent, componentFunc);
            plugin.elementJsxElemMap.set(parentAndChild.parent, componentFunc());
            const parentChildMap = new Map<HTMLElement, HTMLElement>();
            for(const {parent, child} of [...components, asWeak(parentAndChild)]) {
                parentChildMap.set(parent.deref(), child.deref());
            }
            return [...parentChildMap.entries()].map(([parent, child])=>asWeak({parent, child}))
        });
    plugin.cleanUpComponents = () =>
        setComponents(components => {
            const res = [];
            for (const component of components) {
                if (component.child.deref()) {
                    if (document.body.contains(component.child.deref())) {
                        res.push(component);
                    } else {
                        plugin.elementJsxFuncMap.delete(component.parent.deref());
                        plugin.elementJsxElemMap.delete(component.parent.deref());
                    }
                }
            }
            return res;
        });
    plugin.removeComponentAtElement = (el: HTMLElement) =>
        setComponents(components => components.filter(x => x.child.deref() &&  x.parent.deref() && x.child.deref() != el && x.parent.deref() != el));
        
    const portals = components.filter(x=>plugin.elementJsxElemMap.has(x.parent.deref())&&plugin.elementJsxElemMap.get(x.parent.deref())).map(x=>plugin.ReactDOM.createPortal(plugin.elementJsxElemMap.get(x.parent.deref()), x.child.deref()))
    
    try {
        const namespaceObject = getNamespaceObject(GLOBAL_NAMESPACE);
        const GlobalContext = namespaceObject["GlobalContext"];
        if(GlobalContext){
            return (<GlobalContext>
                    {portals}
                </GlobalContext>
            );
        } else {
        }
    } catch(e) {
    } 
    return (
        <div>{portals}</div>
    );
};
