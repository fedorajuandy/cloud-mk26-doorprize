module.exports = {
  apps: [
    {
      name: "cloud-mk26-wishing-tree",              // Name of your application
      script: "./app.js",      // Path to the main file
      instances: "1",           // Auto-detect the number of instances (for clustering)
      exec_mode: "cluster",       // Run in cluster mode
    },
  ],
};
