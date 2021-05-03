#Obsidian #Jsx #React #Functional #Components 

[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/elias-sundqvist/obsidian-react-components?style=for-the-badge&sort=semver)](https://github.com/elias-sundqvist/obsidian-react-components/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/elias-sundqvist/obsidian-react-components/total?style=for-the-badge)
# Obsidian React Components

This is a plugin for Obsidian (https://obsidian.md).

It allows you to write and use React components with Jsx inside your Obsidian notes. 

## Demonstration
![](images/demo.gif)

## Getting Started 

In order to use the plugin, you must first specify a folder for the Jsx functions / react components. 

![](images/settings.png)

Every note in this directory will be interpreted as the content of a Jsx function (implicitly of the form `props=>{your code here}`)

Every file becomes a function/react component with the same name as the note. 

## Using Components

Jsx code can be called both using full code blocks (using the `jsx-` environment) or though inline code (with the prefix `jsx-`).



As can be seen above, you can either include components using the block level (code environment) approach:  

````
```jsx-
<Testcomponent source="Click Me!"/>
```
````

... or using the inline code (with prefix) approach

```md
A dice roller:  `jsx-<DiceRoller sides={10}/>`
```

The definitions for the example components used above can be found in the [Example Components](#Example-components) section further down. 

## Writing Components

The syntax for writing components is regular [Jsx Syntax](https://reactjs.org/docs/introducing-jsx.html)

Each file is interpreted as a single function with the same name as the note file.  So if you, in obsidian, write the note `Clock` inside your components folder, then all other Jsx code blocks will get access to a corresponding new function/component `Clock`. 

The content of your component file is implicitly wrapped in `props=>{...}`. This means that you *don't* write the function signature yourself. You *do*, however, need to include the `return` keywork in your code. 

Other things to keep in mind:
* Since the notes are interpreted as function variables, they must follow the javascript variable naming rules.
    * Variable names cannot contain spaces.
    * Variable names must begin with a letter, an underscore (_) or a dollar sign ($).
    * Variable names can only contain letters, numbers, underscores, or dollar signs.
    * Variable names are case-sensitive.
    * Certain words may not be used as variable names, because they have other meanings within JavaScript. Check out this [complete list of the reserved words](https://www.dummies.com/cheatsheet/javascriptforkids).
* In order to be used as a React component, the first letter of the function must be capitalized. 

## Component Scope

The react components have access to everything inside the global scope. (Use with caution, API changes could break your components).

Besides this, the components have access to `React`, `ReactDOM`, `useState`, and `useEffect`. 
This allows you to easily write functional components. 

Besides that, `ctx`, which is the *file context* is also available. You can, for instance, get frontmatter data from here. Note, however, that the components don`t automatically refresh after the frontmatter is updated. 

In the future, I would like to add an object that exposes useful variables and is more resilient to API changes. (similar to `tp` in the [Templater Plugin](https://github.com/SilentVoid13/Templater)). (See [Roadmap](#Roadmap))

## Roadmap

- [] Expose more useful variables to the component scope
- [] Ensure that components are reloaded when relevant info is changed

## Contributing

Feel free to contribute.

You can create an [issue](https://github.com/elias-sundqvist/obsidian-react-components/issues) to report a bug, suggest an improvement for this plugin, ask a question, etc.

You can make a [pull request](https://github.com/elias-sundqvist/obsidian-react-components/pulls) to contribute to this plugin development.


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