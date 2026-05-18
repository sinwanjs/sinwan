import { cc, For, Show, type Reactive } from "sinwan/component";
import { useFetch } from "sinwan/hook";
import {
  computed,
  signal,
  type Computed,
  type Signal,
} from "sinwan/reactivity";

interface Database {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

interface Databases {
  databases: Database[];
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
};

export const App = cc(() => {
  const { data, isFetching, error } = useFetch("/api/dbs").json<Databases>();

  const databases = computed<Database[]>(() => data.value?.databases || []);
  console.log(
    "Fetched databases:",
    computed(() => data.value?.databases),
  );

  const selected = signal<string>("");

  const selectedDb = computed(() => {
    return databases.value.find((db) => db.name === selected.value);
  });

  const totalSize = computed(() =>
    databases.value.reduce((acc, db) => acc + db.sizeOnDisk, 0),
  );

  return (
    <div class="min-h-screen bg-[#0b1020] text-white">
      <div class="max-w-7xl mx-auto p-8">
        <div class="flex items-center justify-between mb-10">
          <div>
            <h1 class="text-4xl font-black tracking-tight">Mongo Dashboard</h1>
            <p class="text-gray-400 mt-2">
              Real-time database overview powered by Sinwan
            </p>
          </div>
          <div class="px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
            <div class="text-xs uppercase tracking-wider text-gray-400">
              Environment
            </div>
            <div class="font-semibold text-emerald-400">Connected</div>
          </div>
        </div>

        <Show when={isFetching}>
          <div class="grid grid-cols-3 gap-6 mb-8">
            <For each={[1, 2, 3]}>
              {() => (
                <div class="h-32 rounded-3xl bg-white/5 animate-pulse border border-white/10" />
              )}
            </For>
          </div>
        </Show>

        <Show when={error}>
          <div class="p-5 rounded-3xl border border-red-500/30 bg-red-500/10 text-red-300 mb-8">
            Failed to load databases.
          </div>
        </Show>

        <Show when={data}>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <StatCard
              title="Total Databases"
              value={computed(() => `${databases.value.length}`)}
            />
            <StatCard
              title="Total Storage"
              value={computed(() => formatSize(totalSize.value))}
            />
            <StatCard
              title="Empty Databases"
              value={computed(
                () => `${databases.value.filter((db) => db.empty).length}`,
              )}
            />
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-[350px_1fr] gap-8">
            <div class="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
              <div class="p-5 border-b border-white/10">
                <h2 class="text-xl font-bold">Databases</h2>
                <p class="text-sm text-gray-400 mt-1">
                  Select a database to inspect
                </p>
              </div>

              <div class="max-h-[650px] overflow-y-auto">
                <For each={databases}>
                  {(db) => (
                    <DatabaseButton
                      db={db}
                      isSelected={computed(() => selected.value === db.name)}
                      onSelect={() => {
                        console.log("Selected DB:", db.name);
                        selected.value = db.name;
                      }}
                    />
                  )}
                </For>
              </div>
            </div>

            <div class="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <Show
                when={selectedDb}
                fallback={
                  <div class="h-full flex items-center justify-center text-gray-500">
                    Select a database to view details
                  </div>
                }
              >
                {(db) => <DatabaseDetails db={db} />}
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
});

const DatabaseButton = cc<{
  db: Database;
  isSelected: Computed<boolean>;
  onSelect: () => void;
}>(({ db, isSelected, onSelect }) => {
  const buttonClass = computed(() =>
    isSelected.value ? "bg-indigo-500/20 border-indigo-400/30" : "",
  );

  return (
    <button
      onClick={onSelect}
      class={buttonClass}
      style="width: 100%; padding: 1.25rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;"
    >
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-white">{db.name}</div>
          <div class="text-sm text-gray-400 mt-1">
            {formatSize(db.sizeOnDisk)}
          </div>
        </div>
        <div
          class={db.empty ? "bg-yellow-400" : "bg-emerald-400"}
          style="width: 0.75rem; height: 0.75rem; border-radius: 50%;"
        />
      </div>
    </button>
  );
});

const DatabaseDetails = cc<{ db: Database }>(({ db }) => {
  const statusClass = db.empty
    ? "bg-yellow-500/15 text-yellow-300"
    : "bg-emerald-500/15 text-emerald-300";

  return (
    <div>
      <div class="flex items-start justify-between mb-10">
        <div>
          <h2 class="text-3xl font-black">{db.name}</h2>
          <p class="text-gray-400 mt-2">Database analytics and metadata</p>
        </div>

        <div
          class={statusClass}
          style="padding: 0.5rem 1rem; border-radius: 1rem; font-size: 0.875rem; font-weight: 600;"
        >
          {db.empty ? "Empty" : "Active"}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InfoCard title="Storage Used" value={formatSize(db.sizeOnDisk || 0)} />
        <InfoCard
          title="Database State"
          value={db.empty ? "No collections" : "Operational"}
        />
        <InfoCard title="Collections" value={db.empty ? "0" : "Available"} />
        <InfoCard title="Engine" value="MongoDB" />
      </div>

      <div class="mt-10">
        <h3 class="text-xl font-bold mb-5">Activity Overview</h3>
        <div class="h-64 rounded-3xl border border-white/10 bg-[#0f172d] flex items-end gap-3 p-6">
          <For each={[35, 60, 45, 90, 70, 50, 100, 80]}>
            {(height) => (
              <div class="flex-1 flex items-end h-full">
                <div
                  style={`height:${height}%`}
                  class="w-full rounded-2xl bg-gradient-to-t from-indigo-500 to-cyan-400 transition-all duration-300 hover:opacity-80"
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
});

const StatCard = cc<{ title: string; value: Reactive<string> }>(
  ({ title, value }) => {
    return (
      <div class="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
        <div class="text-sm uppercase tracking-wider text-gray-400 mb-3">
          {title}
        </div>
        <div class="text-4xl font-black">{value}</div>
      </div>
    );
  },
);

const InfoCard = cc<{ title: string; value: Reactive<string> }>(
  ({ title, value }) => {
    return (
      <div class="rounded-3xl border border-white/10 bg-[#10182d] p-6">
        <div class="text-sm text-gray-400 mb-2">{title}</div>
        <div class="text-2xl font-bold">{value}</div>
      </div>
    );
  },
);
