import { RuleTester } from "eslint";
import rule from "../src/rules/no-state-getter-call-in-jsx";

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run("no-state-getter-call-in-jsx", rule, {
  valid: [
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
        const [items, setItems] = useState([1, 2, 3]);
        function Component() {
          return <For each={items}>{(item) => <span>{item}</span>}</For>;
        }
      `,
    },
    {
      code: `
        function Component() {
          const msg = getMessage();
          return <div>{msg}</div>;
        }
      `,
    },
  ],

  invalid: [
    {
      code: `
        const [count, setCount] = useState(0);
        function Component() {
          return <div>{count()}</div>;
        }
      `,
      errors: [{ messageId: "noCallInJsx" }],
    },
    {
      code: `
        const [count, setCount] = useState(0);
        function Component() {
          return <input value={count()} />;
        }
      `,
      errors: [{ messageId: "noCallInJsx" }],
    },
    {
      code: `
        const [items, setItems] = useState([1, 2, 3]);
        function Component() {
          return <For each={items()}>{(item) => <span>{item}</span>}</For>;
        }
      `,
      errors: [{ messageId: "noCallInJsx" }],
    },
    {
      code: `
        const [state, dispatch] = useReducer(reducer, 0);
        function Component() {
          return <div>{state()}</div>;
        }
      `,
      errors: [{ messageId: "noCallInJsx" }],
    },
  ],
});
