// Le champ `exports` d'ECharts 5 ne déclare pas de types pour ses sous-chemins : on les relie à ses déclarations publiées.
declare module 'echarts/core' { export * from 'echarts/types/dist/core'; }
declare module 'echarts/charts' { export * from 'echarts/types/dist/charts'; }
declare module 'echarts/components' { export * from 'echarts/types/dist/components'; }
declare module 'echarts/renderers' { export * from 'echarts/types/dist/renderers'; }
