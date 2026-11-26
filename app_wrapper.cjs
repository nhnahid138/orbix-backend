import('./dist/main.js').catch((error) => {
  console.error(error);
  process.exit(1);
});
