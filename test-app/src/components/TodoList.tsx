import { onUpdated } from "sinwan";
import { signal, computed, createComponent, For } from "sinwan";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

let nextId = 1;

export const TodoList = createComponent(() => {
  const todos = signal<Todo[]>([
    { id: nextId++, text: "Try sinwan", done: true },
    { id: nextId++, text: "Build something cool", done: false },
  ]);
  const draft = signal("");

  const remaining = computed(() => todos.value.filter((t) => !t.done).length);

  const add = () => {
    const text = draft.value.trim();
    if (!text) return;
    todos.value = [...todos.value, { id: nextId++, text, done: false }];
    draft.value = "";
  };

  const toggle = (id: number) => {
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t,
    );
  };

  const remove = (id: number) => {
    todos.value = todos.value.filter((t) => t.id !== id);
  };

  onUpdated(() => {
    console.log("Todos updated:", todos.value.length);
  });

  return (
    <>
      <div class="row">
        <input
          type="text"
          placeholder="What needs doing?"
          value={draft}
          onInput={(e) =>
            (draft.value = (e.currentTarget as HTMLInputElement).value)
          }
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === "Enter") add();
          }}
        />
        <button onClick={add}>Add</button>
      </div>
      <ul id="todo-list" class="todos">
        <For each={todos} fallback={<li class="empty">No todos yet!</li>}>
          {(todo) => (
            <li class={todo.done ? "done" : ""}>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggle(todo.id)}
              />
              <span>{todo.text}</span>
              <button onClick={() => remove(todo.id)}>x</button>
            </li>
          )}
        </For>
      </ul>
      <div class="row" style={{ marginTop: "12px", color: "var(--muted)" }}>
        <span class="badge">{remaining}</span>
        <span>remaining</span>
      </div>
    </>
  );
});
