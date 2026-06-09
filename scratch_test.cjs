const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.extraction.findFirst().then(j => {
  if(!j) return console.log('no job');
  const job = { ...j, clauses: j.clauses ? JSON.parse(j.clauses) : [], config: j.config ? JSON.parse(j.config) : {}, logs: j.logs ? JSON.parse(j.logs) : [] };
  console.log(JSON.stringify(job, null, 2));
}).finally(() => p.$disconnect());
