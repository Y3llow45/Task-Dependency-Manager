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
function enrichTask(task) {
  const dependsOn = task.dependsOnIds.map(id => {
    const dep = tasks.find(t => t.id === id);
    return dep ? enrichTask(dep) : null;
  }).filter(Boolean);
  const subTasks = task.subTaskIds.map(id => {
    const sub = tasks.find(t => t.id === id);
    return sub ? enrichTask(sub) : null;
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
    dependsOn: dependsOn,
    subTasks: subTasks,
    isReady: isReady,
    progress: progress
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
  tasks: () => tasks.map(enrichTask),
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
  res.send(`<h1>Task Dependency Manager</h1><p>Go to <a href="/graphql">/graphql</a></p>`);
});
app.get('/graphql', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>GraphiQL</title>
<style>body{margin:0}</style>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<link rel="stylesheet" href="https://unpkg.com/graphiql/graphiql.min.css" />
<script src="https://unpkg.com/graphiql/graphiql.min.js"></script>
</head>
<body>
<div id="graphiql" style="height:100vh"></div>
<script>
const root = ReactDOM.createRoot(document.getElementById('graphiql'));
root.render(
  React.createElement(GraphiQL, {
    fetcher: GraphiQL.createFetcher({ url: '/graphql' }),
  })
);
</script>
</body>
</html>
  `);
});
app.post('/graphql', async (req, res) => {
  const { query, variables } = req.body;
  try {
    const response = await graphql({
      schema: schema,
      source: query,
      rootValue: root,
      variableValues: variables || {}
    });
    res.json(response);
  } catch (error) {
    res.status(400).json({ errors: [ { message: error.message } ] });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server ready at http://localhost:' + PORT);
  console.log('GraphiQL at http://localhost:' + PORT + '/graphql');
});
export default app;
