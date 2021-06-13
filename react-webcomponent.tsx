import { default as OfflineReact } from 'react';
import { default as OfflineReactDOM } from 'react-dom';

const reactComponentSymbol = Symbol.for('r2wc.reactComponent');
const renderSymbol = Symbol.for('r2wc.reactRender');
const shouldRenderSymbol = Symbol.for('r2wc.shouldRender');

const define = {
    // Creates a getter/setter that re-renders everytime a property is set.
    expando: function (receiver, key, value) {
        Object.defineProperty(receiver, key, {
            enumerable: true,
            get: function () {
                return value;
            },
            set: function (newValue) {
                value = newValue;
                this[renderSymbol]();
            }
        });
        receiver[renderSymbol]();
    }
};

const reactToWebComponent = function (
    ReactComponent,
    React: typeof OfflineReact,
    ReactDOM: typeof OfflineReactDOM,
    options: { shadow?: boolean } = {}
): CustomElementConstructor {
    const renderAddedProperties = { isConnected: 'isConnected' in HTMLElement.prototype };
    let rendering = false;
    // Create the web component "class"
    const WebComponent = function (...args) {
        const self = Reflect.construct(HTMLElement, args, this.constructor);
        if (options.shadow) {
            self.attachShadow({ mode: 'open' });
        }
        return self;
    };

    // Make the class extend HTMLElement
    const targetPrototype = Object.create(HTMLElement.prototype);
    targetPrototype.constructor = WebComponent;

    // But have that prototype be wrapped in a proxy.
    const proxyPrototype = new Proxy(targetPrototype, {
        has: function () {
            return true;
        },

        // when any undefined property is set, create a getter/setter that re-renders
        set: function (target, key, value, receiver) {
            if (rendering) {
                renderAddedProperties[key] = true;
            }

            if (typeof key === 'symbol' || renderAddedProperties[key] || key in target) {
                return Reflect.set(target, key, value, receiver);
            } else {
                define.expando(receiver, key, value);
            }
            return true;
        },
        // makes sure the property looks writable
        getOwnPropertyDescriptor: function (target, key) {
            const own = Reflect.getOwnPropertyDescriptor(target, key);
            if (own) {
                return own;
            }

            return { configurable: true, enumerable: true, writable: true, value: undefined };
        }
    });
    WebComponent.prototype = proxyPrototype;

    // Setup lifecycle methods
    targetPrototype.connectedCallback = function () {
        // Once connected, it will keep updating the innerHTML.
        // We could add a render method to allow this as well.
        [...this.attributes].forEach(x => {
            attrs.add(x.name);
            this[x.name] = x.value;
        });
        this[shouldRenderSymbol] = true;
        this[renderSymbol]();
    };
    targetPrototype[renderSymbol] = function () {
        if (this[shouldRenderSymbol] === true) {
            const data = {};
            Object.keys(this).forEach(function (key) {
                if (renderAddedProperties[key] !== false) {
                    data[key] = this[key];
                }
            }, this);
            rendering = true;
            // Container is either shadow DOM or light DOM depending on `shadow` option.
            const container = options.shadow ? this.shadowRoot : this;
            // Use react to render element in container
            // eslint-disable-next-line react/no-render-return-value
            this[reactComponentSymbol] = ReactDOM.render(React.createElement(ReactComponent, data), container);
            rendering = false;
        }
    };

    // Handle attributes changing
    const attrs = new Set('l');
    WebComponent.observedAttributes = attrs;

    targetPrototype.attributeChangedCallback = function (name, oldValue, newValue) {
        [...this.attributes].forEach(x => {
            attrs.add(x.name);
            this[x.name] = x.value;
        });
        this[name] = newValue;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return WebComponent as any;
};

export default reactToWebComponent;
