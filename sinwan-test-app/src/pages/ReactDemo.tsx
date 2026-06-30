import { cc, For, Show } from "sinwan/component";
import { useEffect, useState } from "sinwan/react-client";

interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

interface Task {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  status: "Backlog" | "In_Progress" | "Done";
  subTasks: SubTask[];
  dueDate: string; // Format YYYY-MM-DD
}

const AdvancedKanban = cc(() => {
  // --- ÉTATS ---
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Implémenter le moteur réactif Sinwan",
      priority: "High",
      status: "In_Progress",
      subTasks: [
        { id: "1-1", text: "Parser les tags <Show>", completed: true },
        {
          id: "1-2",
          text: "Optimiser les proxys de useState",
          completed: false,
        },
      ],
      dueDate: "2026-07-15",
    },
    {
      id: "2",
      title: "Rédiger la documentation technique",
      priority: "Medium",
      status: "Backlog",
      subTasks: [
        { id: "2-1", text: "Créer des exemples interactifs", completed: false },
      ],
      dueDate: "2026-06-01", // Dépassée
    },
  ]);

  const [filterPriority, setFilterPriority] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");

  // --- LOGIQUE COMPORTEMENTALE (EFFETS) ---
  // Alerte automatique dans la console si une tâche prioritaire est en retard
  useEffect(() => {
    const now = new Date().toISOString().slice(0, 10);
    const overdueHighPriority = tasks().filter(
      (t) => t.priority === "High" && t.status !== "Done" && t.dueDate < now,
    );
    if (overdueHighPriority.length > 0) {
      console.warn(
        `Attention : ${overdueHighPriority.length} tâche(s) critique(s) en retard !`,
      );
    }
  }, [tasks]);

  // --- ACTIONS (MUTATIONS D'ÉTAT) ---
  const handleAddTask = () => {
    if (!newTaskTitle().trim()) return;

    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle(),
      priority: "Medium",
      status: "Backlog",
      subTasks: [],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10), // +7 jours
    };

    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle(""); // Reset le champ
  };

  const updateTaskStatus = (
    id: string,
    nextStatus: "Backlog" | "In_Progress" | "Done",
  ) => {
    setTasks((list) =>
      list.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)),
    );
  };

  const toggleSubTask = (taskId: string, subTaskId: string) => {
    setTasks((list) =>
      list.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subTasks: t.subTasks.map((st) =>
            st.id === subTaskId ? { ...st, completed: !st.completed } : st,
          ),
        };
      }),
    );
  };

  // --- CALCULS SYSTÈME (FILTRAGE DE FLUX) ---
  const getFilteredTasks = () => {
    return tasks().filter((task) => {
      const matchesPriority =
        filterPriority() === "All" || task.priority === filterPriority();
      const matchesSearch = task.title
        .toLowerCase()
        .includes(searchQuery().toLowerCase());
      return matchesPriority && matchesSearch;
    });
  };

  const getTasksByStatus = (status: "Backlog" | "In_Progress" | "Done") => {
    return getFilteredTasks().filter((t) => t.status === status);
  };

  const handleDrop = (e: DragEvent, status: Task["status"]) => {
    e.preventDefault();
    const taskId = e.dataTransfer?.getData("text/plain");
    console.log("[drop] target", status, "taskId", taskId);
    if (taskId) {
      updateTaskStatus(taskId, status);
    }
  };

  // Calcule le pourcentage global de complétion
  const getCompletionStats = () => {
    const all = tasks();
    if (all.length === 0) return "0%";
    const done = all.filter((t) => t.status === "Done").length;
    return `${Math.round((done / all.length) * 100)}%`;
  };

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        padding: "24px",
        background: "#f4f5f7",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          marginBottom: "24px",
          borderBottom: "2px solid #ddd",
          paddingBottom: "12px",
        }}
      >
        <h1>Sinwan Enterprise Kanban</h1>
        <p>
          Progression globale du Sprint :{" "}
          <strong>{getCompletionStats()}</strong>
        </p>
      </header>
      {/* --- PANNEL DE RECHERCHE & CONTROLE --- */}
      <section
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Rechercher une tâche..."
          value={searchQuery()}
          oninput={(e: any) => setSearchQuery(e.target.value)}
          style={{ padding: "8px", flex: "1" }}
        />

        <select
          onchange={(e: any) => setFilterPriority(e.target.value)}
          style={{ padding: "8px" }}
        >
          <option value="All">Toutes les priorités</option>
          <option value="High">Haute</option>
          <option value="Medium">Moyenne</option>
          <option value="Low">Basse</option>
        </select>

        <div style={{ display: "flex", gap: "4px" }}>
          <input
            type="text"
            placeholder="Nouvelle tâche urgente..."
            value={newTaskTitle()}
            oninput={(e: any) => setNewTaskTitle(e.target.value)}
            style={{ padding: "8px" }}
          />
          <button
            onclick={handleAddTask}
            style={{
              padding: "8px",
              background: "#0052cc",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            + Ajouter
          </button>
        </div>
      </section>
      {/* --- LE TABLEAU KANBAN --- */}
      <div
        style={{
          display: "flex",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
        }}
      >
        {/* COLONNE : BACKLOG */}
        <div
          style={{
            background: "#ebecf0",
            padding: "12px",
            borderRadius: "4px",
            minHeight: "120px",
          }}
          ondragover={(e: DragEvent) => e.preventDefault()}
          ondrop={(e: DragEvent) => handleDrop(e, "Backlog")}
        >
          <h3>Backlog ({getTasksByStatus("Backlog").length})</h3>
          <For each={() => getTasksByStatus("Backlog")}>
            {(task) => (
              <TaskCard
                task={task}
                onStatusChange={updateTaskStatus}
                onToggleSub={toggleSubTask}
              />
            )}
          </For>
        </div>

        {/* COLONNE : IN PROGRESS */}
        <div
          style={{
            background: "#e3f2fd",
            padding: "12px",
            borderRadius: "4px",
            minHeight: "120px",
          }}
          ondragover={(e: DragEvent) => e.preventDefault()}
          ondrop={(e: DragEvent) => handleDrop(e, "In_Progress")}
        >
          <h3>En cours ({getTasksByStatus("In_Progress").length})</h3>
          <For each={() => getTasksByStatus("In_Progress")}>
            {(task) => (
              <TaskCard
                task={task}
                onStatusChange={updateTaskStatus}
                onToggleSub={toggleSubTask}
              />
            )}
          </For>
        </div>

        {/* COLONNE : DONE */}
        <div
          style={{
            background: "#e8f5e9",
            padding: "12px",
            borderRadius: "4px",
            minHeight: "120px",
          }}
          ondragover={(e: DragEvent) => e.preventDefault()}
          ondrop={(e: DragEvent) => handleDrop(e, "Done")}
        >
          <h3>Terminé ({getTasksByStatus("Done").length})</h3>
          <For each={() => getTasksByStatus("Done")}>
            {(task) => (
              <TaskCard
                task={task}
                onStatusChange={updateTaskStatus}
                onToggleSub={toggleSubTask}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
});

/* --- SOUS-COMPOSANT DE CARTE (Optimisé pour la réactivité Sinwan) --- */
const TaskCard = ({
  task,
  onStatusChange,
  onToggleSub,
}: {
  task: Task;
  onStatusChange: any;
  onToggleSub: any;
}) => {
  const isOverdue = () => {
    const now = new Date().toISOString().slice(0, 10);
    return task.dueDate < now && task.status !== "Done";
  };

  return (
    <div
      draggable
      ondragstart={(e: DragEvent) => {
        console.log("[drag] start", task.id);
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      style={{
        background: "white",
        padding: "12px",
        marginBottom: "8px",
        borderRadius: "4px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        borderLeft: `5px solid ${task.priority === "High" ? "#de350b" : "#ffab00"}`,
        cursor: "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
        }}
      >
        <h4 style={{ margin: "0 0 8px 0" }}>{task.title}</h4>

        {/* Badge Retard */}
        <Show when={isOverdue()}>
          <span
            style={{
              background: "#ffebe6",
              color: "#de350b",
              fontSize: "10px",
              padding: "2px 4px",
              borderRadius: "3px",
              fontWeight: "bold",
            }}
          >
            RETARD
          </span>
        </Show>
      </div>

      <p style={{ fontSize: "11px", color: "#666", margin: "4px 0" }}>
        Échéance : {task.dueDate}
      </p>

      {/* Rendu des Sous-tâches imbriquées */}
      <Show when={task.subTasks.length > 0}>
        <div
          style={{
            margin: "8px 0",
            paddingLeft: "8px",
            borderLeft: "2px solid #ddd",
          }}
        >
          <For each={task.subTasks}>
            {(sub) => (
              <div
                style={{
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onchange={() => onToggleSub(task.id, sub.id)}
                />
                <span
                  style={
                    sub.completed
                      ? { textDecoration: "line-through", color: "#888" }
                      : {}
                  }
                >
                  {sub.text}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Sélecteur de statut de flux (Workflow) */}
      <div
        style={{
          marginTop: "12px",
          display: "flex",
          gap: "4px",
          justifyContent: "flex-end",
        }}
      >
        <Show when={task.status !== "Backlog"}>
          <button
            onclick={() => onStatusChange(task.id, "Backlog")}
            style={{ fontSize: "10px", cursor: "pointer" }}
          >
            ← Backlog
          </button>
        </Show>
        <Show when={task.status !== "In_Progress"}>
          <button
            onclick={() => onStatusChange(task.id, "In_Progress")}
            style={{ fontSize: "10px", cursor: "pointer" }}
          >
            Work
          </button>
        </Show>
        <Show when={task.status !== "Done"}>
          <button
            onclick={() => onStatusChange(task.id, "Done")}
            style={{
              fontSize: "10px",
              cursor: "pointer",
              background: "#36b37e",
              color: "white",
              border: "none",
            }}
          >
            ✓ Fini
          </button>
        </Show>
      </div>
    </div>
  );
};

export default AdvancedKanban;
