import express from 'express';
import { graphql, buildSchema } from 'graphql';
import cors from 'cors';

const app = express();

let tasks = [
  {id:'1',title:'Setup project folder',completed:true,dependsOnIds:[],subTaskIds:['2']},
  {id:'2',title:'Define GraphQL schema',completed:false,dependsOnIds:['1'],subTaskIds:['3']},
  {id:'3',title:'Implement resolvers with logic',completed:false,dependsOnIds:['2'],subTaskIds:[]},
  {id:'4',title:'Deploy to Vercel',completed:false,dependsOnIds:['3'],subTaskIds:[]}
];

function enrichTask(task, visited = new Set()) {
  if (visited.has(task.id)) {
    return { ...task, dependsOn: [], subTasks: [], isReady: false, progress: 0 };
  }
  visited.add(task.id);

  const dependsOn = task.dependsOnIds.map(id => {
    const dep = tasks.find(t => t.id === id);
    return dep ? enrichTask(dep, new Set(visited)) : null;
  }).filter(Boolean);

  const subTasks = task.subTaskIds.map(id => {
    const sub = tasks.find(t => t.id === id);
    return sub ? enrichTask(sub, new Set(visited)) : null;
  }).filter(Boolean);

  const isReady = task.dependsOnIds.length === 0 || task.dependsOnIds.every(id => {
    const dep = tasks.find(t => t.id === id);
    return dep && dep.completed;
  });

  let progress = 0;
  if (task.subTaskIds.length === 0) {
    progress = task.completed ? 100 : 0;
  } else {
    const subs = task.subTaskIds.map(id => tasks.find(t => t.id === id)).filter(Boolean);
    if (subs.length > 0) {
      const total = subs.reduce((sum, s) => sum + (s.completed ? 100 : 0), 0);
      progress = Math.round(total / subs.length);
    }
  }

  return {
    ...task,
    dependsOn,
    subTasks,
    isReady,
    progress
  };
}

const schema = buildSchema(`
  type Task {
    id: ID!
    title: String!
    completed: Boolean!
    dependsOn: [Task!]!
    subTasks: [Task!]!
    isReady: Boolean!
    progress: Int!
  }
  type Query {
    tasks: [Task!]!
    task(id: ID!): Task
  }
  type Mutation {
    addTask(title: String!, dependsOnIds: [ID!], subTaskIds: [ID!]): Task!
    toggleComplete(id: ID!): Task
  }
`);

const root = {
  tasks: () => tasks.map(t => enrichTask(t)),
  task: (args) => {
    const t = tasks.find(t => t.id === args.id);
    return t ? enrichTask(t) : null;
  },
  addTask: (args) => {
    const newTask = {
      id: String(Date.now()),
      title: args.title,
      completed: false,
      dependsOnIds: args.dependsOnIds || [],
      subTaskIds: args.subTaskIds || []
    };
    tasks.push(newTask);
    return enrichTask(newTask);
  },
  toggleComplete: (args) => {
    const task = tasks.find(t => t.id === args.id);
    if (!task) throw new Error('Task not found');
    task.completed = !task.completed;
    return enrichTask(task);
  }
};

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`<h1>Task Dependency Manager</h1><p><a href="/graphql">Go to GraphQL Explorer</a></p>`);
});

app.get('/graphql', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GraphQL Explorer</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#1e1e1e; color:#ddd; }
    .container { display:flex; height:100vh; }
    .left { width:50%; padding:15px; border-right:1px solid #333; display:flex; flex-direction:column; }
    .right { width:50%; padding:15px; overflow:auto; background:#252526; }
    textarea { flex:1; font-family: monospace; font-size:15px; background:#1e1e1e; color:#ddd; border:1px solid #444; padding:10px; resize:none; }
    button { padding:10px 20px; font-size:16px; background:#007acc; color:white; border:none; cursor:pointer; margin-top:10px; }
    button:hover { background:#005a99; }
    pre { white-space:pre-wrap; word-break:break-all; }
    h2 { margin-top:0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="left">
      <h2>Query / Mutation</h2>
      <textarea id="query" spellcheck="false">query {
  tasks {
    id
    title
    completed
    isReady
    progress
    dependsOn { title }
    subTasks { title progress }
  }
}</textarea>
      <button onclick="runQuery()">▶ Run (Ctrl + Enter)</button>
    </div>
    <div class="right">
      <h2>Result</h2>
      <pre id="result">Click Run to execute...</pre>
    </div>
  </div>

  <script>
    const queryInput = document.getElementById('query');
    const resultDiv = document.getElementById('result');

    async function runQuery() {
      const query = queryInput.value.trim();
      if (!query) {
        resultDiv.textContent = "Please enter a query";
        return;
      }
      try {
        const res = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const json = await res.json();
        resultDiv.textContent = JSON.stringify(json, null, 2);
      } catch (err) {
        resultDiv.textContent = 'Network error: ' + err.message;
      }
    }

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') runQuery();
    });
  </script>
</body>
</html>
  `);
});

app.post('/graphql', async (req, res) => {
  const { query, variables } = req.body || {};
  if (!query) {
    res.status(400).json({ errors: [{ message: "Query is required" }] });
    return;
  }
  try {
    const response = await graphql({
      schema: schema,
      source: query,
      rootValue: root,
      variableValues: variables || {}
    });
    res.json(response);
  } catch (error) {
    res.status(400).json({ 
      errors: [{ message: error.message || "GraphQL execution error" }] 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server ready at http://localhost:' + PORT);
  console.log('GraphQL at http://localhost:' + PORT + '/graphql');
});

export default app;
