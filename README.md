[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/elias-sundqvist/obsidian-react-components?style=for-the-badge&sort=semver)](https://github.com/elias-sundqvist/obsidian-react-components/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/elias-sundqvist/obsidian-react-components/total?style=for-the-badge)
# Obsidian React Components

This is a plugin for Obsidian (https://obsidian.md).

It allows you to write and use React components with Jsx inside your Obsidian notes. 

It is highly recommended that you also install the [Editor Syntax Highlight Plugin](https://github.com/deathau/cm-editor-syntax-highlight-obsidian) when using this plugin.  

## Demonstration
![React Components Demo](https://user-images.githubusercontent.com/9102856/131183517-e136e585-044c-482a-b6d1-fddc3134bac8.gif)

## Getting Started 

There are two methods for creating react components.
### Using Code Blocks

Put a note anywhere in your vault and give it the property `defines-react-components`. You can also optionally set a specific namespace (series of words separated by dots), using the `react-components-namespace` property. 

This can either be done in the frontmatter, like so:

```yaml
---
defines-react-components: true
react-components-namespace: projects.test
---
```

or (if dataview is installed) using dataview inline properties

```m
defines-react-components:: true
react-components-namespace:: projects.test
```

Then, in your note, to define a component, write a code block like this
````md
```jsx:component:MyComponent
return <div>Hello {props.name}!</div>
```
````

This will create a component called `MyComponent`, located in the `projects.test` namespace (or in the global namespace if you left the property unspecified).

You can then use the component like this:

````md
```jsx:
<MyComponent name={"World"}/>
```
````
Or, using inline syntax.

````md
`jsx:<MyComponent name={"World"}/>`
````

If you are in a note which uses a separate namespace, you can access the component like so:

````md
`jsx:<projects.test.MyComponent name={"World"}/>`
````




### Using Component Notes

An alternative way of creating components is *component notes*. This approach treats an entire markdown file as the definition of a single react component. 
A benefit of this approach is that you can open the note in, for example, visual studio code, to get full syntax highlighting and some code autocompletion.

In order to use component notes, you must first specify a folder for the Jsx functions / react components. 

![image](https://user-images.githubusercontent.com/9102856/131140527-a7acbcd0-6524-4daa-bcd5-17fa4be176cd.png)

Every note in this directory will be interpreted as the content of a Jsx function (implicitly of the form `props=>{your code here}`)

Every file becomes a function/react component with the same name as the note. 

## Writing Components

The syntax for writing components is regular [Jsx Syntax](https://reactjs.org/docs/introducing-jsx.html)

The content of your component file is implicitly wrapped in `props=>{...}`. This means that you *don't* write the function signature yourself. You *do*, however, need to include the `return` keyword in your code. 

Other things to keep in mind:
* Since the notes are interpreted as function variables, they must follow the javascript variable naming rules.
    * Variable names cannot contain spaces.
    * Variable names must begin with a letter, an underscore (_) or a dollar sign ($).
    * Variable names can only contain letters, numbers, underscores, or dollar signs.
    * Variable names are case-sensitive.
    * Certain words may not be used as variable names, because they have other meanings within JavaScript. Check out this [complete list of the reserved words](https://www.dummies.com/cheatsheet/javascriptforkids).
* In order to be used as a React component, the first letter of the function must be capitalized. 

## Using Components

Components can be used like this:

````md
```jsx:
<MyComponent name={"World"}/>
```
````
Or, using inline syntax.

````md
`jsx:<MyComponent name={"World"}/>`
````

If you are in a note which uses a separate namespace, you can access the component like so:

````md
`jsx:<projects.test.MyComponent name={"World"}/>`
````

When using the codeblock syntax, (` ```jsx: `), the code can be multiple lines. The last statement is implicitly returned and rendered. 


## Component Scope

The react components have access to everything inside the global namespace.

Besides this, the components have access to `React`, `ReactDOM`, `useState`, and `useEffect`. 
This allows you to easily write functional components. 

Besides that, you can also access the *file context* through the hook call `useContext(ReactComponentContext);`. This can then be used to, for example, access the frontmatter as follows:

````md
```jsx:component:ComponentWithFrontmatter
const ctx = useContext(ReactComponentContext);
var frontmatter = ctx.markdownPostProcessorContext.frontmatter;

return <h1>{frontmatter.title}</h1>
```
````


## Contributing

Feel free to contribute.

You can create an [issue](https://github.com/elias-sundqvist/obsidian-react-components/issues) to report a bug, suggest an improvement for this plugin, ask a question, etc.

You can make a [pull request](https://github.com/elias-sundqvist/obsidian-react-components/pulls) to contribute to this plugin development.


## Changelog

### 0.1.0 (2021-08-27) *Added Alternative code block Syntax and Namespaces*

* The plugin now has support for writing `jsx:` instead of `jsx-`. 
  * This new syntax is compatible with the [Editor Syntax Highlight Plugin](https://github.com/deathau/cm-editor-syntax-highlight-obsidian): ![syntax highlighting demo](https://user-images.githubusercontent.com/9102856/131139119-0c4e4bf5-914b-4e24-a917-cdac730b270b.gif)
* You can now also restrict how / from where you access components through the `react-components-namespace` property. See Readme for details.
* The Readme has been updated. 

### 0.0.9 (2021-08-26) *Frontmatter Support and Header Components*

* It is now possible to add frontmatter data to the component notes. (it will be ignored by the javascript parser).
* Notes with the frontmatter attribute `use-as-note-header` will be used as a header for all notes in the vault.  
  * This allows you to do things like this: ![header component demo](https://user-images.githubusercontent.com/9102856/130989310-8e99ceb3-701b-440e-8bb6-245cddfaa95e.gif)
  * *note:* only use this frontmatter attribute on at most one vault component. 


### 0.0.8 (2021-08-25) *Minor rendering fix*

* Issue with loading components on obisian start has been resolved. (Issue #19)

### 0.0.7 (2021-07-20) *Add support for mobile, Typescript*

* Issue with loading plugin on Obsidan Mobile has been resolved.
* Typescript syntax is now supported
* Unused dependencies removed

### 0.0.6 (2021-06-19) *Add support for skypack imports, bugfixes*

* Added support for url based imports, such as `import styled from 'https://cdn.skypack.com/styled-components/'`
  * *Example:* ![](https://user-images.githubusercontent.com/9102856/121813903-8123ad80-cc6e-11eb-8c65-b8c77faf51a6.gif)
* Improved stability of component loading

### 0.0.5 (2021-05-22) *Enable dynamic updates of Markdown Rendering component, minor changes*

* Updating the `src` prop of the `Markdown` component previously did not cause the component to rerender. This is now fixed.
* For developers: you can now create a `.vault_plugin_dir` file containing the path to the plugin in your vault: (e.g. `path\to\my\vault\.obsidian\plugins\obsidian-react-components`). Then `yarn build` will automatically copy the compiled files to the correct place. So you only have to reload the plugin in Obsidian to see changes take effect.

### 0.0.4 (2021-05-20) *Improved Component Loading and Error Handling + useIsPreview*

* Add a new setting to disable component refreshing 
  * Useful if re-rendering of components is costly, such as if the component makes API calls.
* Make component loading more reliable (Resolves issue #13)
* Significantly improve error handling
  * All errors are rendered as react components. You can click a button in the component to show the error in the console. 
* Add a command to manually refresh components
  * `Obsidian React Components: Refresh React Components`
* Replace `isPreviewMode` with `useIsPreview`, which check the current pane of the component instead of the currently active component (Resolves issue #12)
  
  Example:
 
    ```js
    const isPreview = useIsPreview()
    if(isPreview) {
      // this only happens if the pane which the component is attached to is in preview mode.
    }
    ```


### 0.0.3 (2021-05-10) *Markdown rendering component, more hooks, and minor fixes*

* Made some minor fixes based on feedback in the [community-plugins PR](https://github.com/obsidianmd/obsidian-releases/pull/280)
* Added a `Markdown` component, which can be used to render makdown.
  * Usage: ``` `jsx-<Markdown src={"* This is a bullet"}/>` ```
* Added `obsidian` to the component scope
* Added more hooks: `useCallback`, `useContext`, `useMemo`, `useReducer`, `useRef`

### 0.0.2 (2021-05-10) *New functionality, bug fixes, and refactoring*
* @lucasew Added an `isPreviewMode` function to the component scope. (PR #5)
  > There is a rule that in React you must call the same hooks at every render so early returns are not good.
  > 
  > The user can easily check if the note is on preview mode inside its component and can return null if it's the case.

* Components which contain sub-components are now correctly updated when the sub-component code is modified. (PR #11)

* Users are now warned when creating components with invalid names (PR #10)

### 0.0.1 (2021-05-04) *First Release*
* Basic functionality of the plugin implemented


## Example components

```jsx
// file: Counter.md
const [count, setCount] = useState(0)
return (
<div>
  <p>You clicked me {count} times!!!</p>
  <button onClick={() => setCount(count + 1)}>
	{props.source}
  </button>
</div>
)
```

```jsx
// file: Clock.md
 const [date, setDate] = useState(new Date());
 useEffect(() => {
  var timerID = setInterval( () => setDate(new Date()), 1000 );
  return function cleanup() {
      clearInterval(timerID);
    };
 });
return (
  <div>
	<h1>Hello, world!</h1>
	<h2>It is {date.toLocaleTimeString()}.</h2>
  </div>
); 
```


```jsx
// file: rand.md
return Math.random()
```

```jsx
// file: DiceRoller.md
let diceRoll = ()=>Math.ceil(rand()*props.sides)
let [num, setNum] = useState(diceRoll())
return (<span>
	<button onClick={()=>setNum(diceRoll())}> Roll the {props.sides}-sided Die</button>
	<span>The number is {num}</span>
</span>)
```

```jsx
// file: Testcomponent.md
return (
<div style={{color: "blue"}}>
	<Clock/>
	<Counter source={props.source}/>
</div>
)
```



## License

[Obsidian React Components](https://github.com/elias-sundqvist/obsidian-react-components) is licensed under the GNU AGPLv3 license. Refer to [LICENSE](https://github.com/elias-sundqvist/obsidian-react-components/blob/master/LICENSE.TXT) for more information.