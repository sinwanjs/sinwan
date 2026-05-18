import { RuleTester } from "eslint";
import rule from "../src/rules/state-getter-must-be-called";

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run("state-getter-must-be-called", rule, {
  valid: [
    {
      code: `
        const [count, setCount] = useState(0);
        console.log(count());
      `,
    },
    {
      code: `
        const [count, setCount] = useState(0);
        setCount(count() + 1);
      `,
    },
    {
      code: `
        const [items, setItems] = useState([1, 2, 3]);
        setItems([...items(), items().length + 1]);
      `,
    },
    {
      code: `
        const [count, setCount] = useState(0);
        function Component() {
          return <div>{count}</div>;
        }
      `,
    },
    {
      code: `
        const [count, setCount] = useState(0);
        function Component() {
          return <input value={count} />;
        }
      `,
    },
    {
      code: `
        const [state, dispatch] = useReducer(reducer, 0);
        console.log(state());
      `,
    },
  ],

  invalid: [
    {
      code: `
        const [count, setCount] = useState(0);
        console.log(count);
      `,
      errors: [{ messageId: "mustCall" }],
    },
    {
      code: `
        const [count, setCount] = useState(0);
        const x = count + 1;
      `,
      errors: [{ messageId: "mustCall" }],
    },
    {
      code: `
        const [items, setItems] = useState([1, 2, 3]);
        const len = items.length;
      `,
      errors: [{ messageId: "mustCallLength" }],
    },
    {
      code: `
        const [count, setCount] = useState(0);
        if (count) { console.log("yes"); }
      `,
      errors: [{ messageId: "mustCall" }],
    },
    {
      code: `
        const [state, dispatch] = useReducer(reducer, 0);
        console.log(state);
      `,
      errors: [{ messageId: "mustCall" }],
    },
  ],
});
