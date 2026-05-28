import { cc } from "sinwan/component";
import { useState } from "sinwan/react-client";

const Contact = cc(() => {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Contact</h1>
      <button onClick={() => setCount(count() + 1)}>{count}</button>
    </div>
  );
});

export default Contact;
