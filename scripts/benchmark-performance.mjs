import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build } from "vite";

const rawPointCount = 18_000;
const sampledPointCount = 1_800;
const repetitions = 9;

const baselineBundleSource = `
  import * as echarts from "echarts";
  globalThis.__benchmarkEcharts = echarts;
`;

const optimizedBundleSource = `
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import {
    AxisPointerComponent,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    TitleComponent,
    TooltipComponent,
  } from "echarts/components";
  import { CanvasRenderer } from "echarts/renderers";

  echarts.use([
    LineChart,
    AxisPointerComponent,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    TitleComponent,
    TooltipComponent,
    CanvasRenderer,
  ]);
  globalThis.__benchmarkEcharts = echarts;
`;

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(1)),
    p95Ms: Number(percentile(values, 0.95).toFixed(1)),
  };
}

async function measureBundle(source) {
  const virtualId = "\0nexus-performance-entry";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: new URL("../apps/web/", import.meta.url).pathname,
    plugins: [{
      name: "nexus-performance-entry",
      resolveId(id) {
        return id === "nexus-performance-entry" ? virtualId : undefined;
      },
      load(id) {
        return id === virtualId ? source : undefined;
      },
    }],
    build: {
      write: false,
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: { input: "nexus-performance-entry" },
    },
  });

  const builds = Array.isArray(result) ? result : [result];
  const code = builds.flatMap((item) => item.output)
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");

  return {
    rawBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
  };
}

const benchmarkPage = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; background: #071015; }
      #chart { width: 1200px; height: 700px; }
    </style>
  </head>
  <body>
    <div id="chart"></div>
    <script type="module">
      import * as echarts from "/echarts.js";

      const ranges = [40, 40, 15, 20, 2];

      function generatePoints(count) {
        const start = Date.UTC(2026, 7, 30, 0, 30, 0);
        return Array.from({ length: count }, (_, index) => {
          const event = Math.exp(-Math.pow((index - count * 0.78) / (count * 0.035), 2));
          return {
            timestamp: start + index * 100,
            values: [
              58 + Math.sin(index / 23) * 1.4 + event * 31,
              57 + Math.cos(index / 29) * 1.2 + event * 27,
              160 + Math.sin(index / 41) * 0.3 + event * 12,
              83 + Math.cos(index / 53) * 0.4 - event * 15,
              0.12 + Math.abs(Math.sin(index / 17)) * 0.08 + event * 1.55,
            ],
          };
        });
      }

      function downsample(points, target) {
        if (points.length <= target) return points;
        const output = [points[0]];
        const bucketSize = (points.length - 2) / (target - 2);

        for (let bucket = 0; bucket < target - 2; bucket += 1) {
          const start = Math.floor(bucket * bucketSize) + 1;
          const end = Math.min(points.length - 1, Math.floor((bucket + 1) * bucketSize) + 1);
          let selected = points[start];
          let bestScore = -1;

          for (let index = start; index < end; index += 1) {
            const current = points[index];
            const previous = points[index - 1];
            const score = current.values.reduce(
              (total, value, signalIndex) => total + Math.abs(value - previous.values[signalIndex]) / ranges[signalIndex],
              current.values[4] * 0.08,
            );
            if (score > bestScore) {
              selected = current;
              bestScore = score;
            }
          }
          output.push(selected);
        }

        output.push(points.at(-1));
        return output;
      }

      function option(points) {
        const incidentAt = points[Math.floor(points.length * 0.78)].timestamp;
        const eventStart = incidentAt - 50000;
        const eventEnd = incidentAt + 82000;
        const grids = [0, 1, 2, 3].map((_, index) => ({
          left: 64,
          right: 24,
          top: 20 + index * 168,
          height: 130,
        }));
        const xAxis = grids.map((_, index) => ({
          type: "time",
          gridIndex: index,
          axisLabel: { show: index === 3 },
          splitLine: { show: false },
        }));
        const yAxis = grids.map((_, index) => ({ type: "value", gridIndex: index, splitLine: { show: false } }));
        const markArea = {
          silent: true,
          data: [[{ xAxis: eventStart }, { xAxis: eventEnd }]],
        };
        const seriesConfig = [
          { signalIndex: 0, axisIndex: 0, name: "좌측 장력", markArea: true, markLine: true },
          { signalIndex: 1, axisIndex: 0, name: "우측 장력" },
          { constantValue: 160, axisIndex: 1, name: "설정 온도", silent: true },
          { signalIndex: 2, axisIndex: 1, name: "측정 온도", markArea: true },
          { signalIndex: 3, axisIndex: 2, name: "라인 속도", markArea: true },
          { signalIndex: 4, axisIndex: 3, name: "비전 검사 결함률", markArea: true },
        ];

        return {
          animation: false,
          grid: grids,
          xAxis,
          yAxis,
          tooltip: { trigger: "axis" },
          axisPointer: { link: [{ xAxisIndex: "all" }] },
          legend: [
            { data: ["좌측 장력", "우측 장력"] },
            { data: ["설정 온도", "측정 온도"], top: "28%" },
          ],
          dataZoom: [{ type: "inside", xAxisIndex: [0, 1, 2, 3], filterMode: "none" }],
          series: seriesConfig.map((config) => ({
            name: config.name,
            type: "line",
            showSymbol: false,
            silent: config.silent,
            xAxisIndex: config.axisIndex,
            yAxisIndex: config.axisIndex,
            data: points.map((point) => [
              point.timestamp,
              config.constantValue ?? point.values[config.signalIndex],
            ]),
            markArea: config.markArea ? markArea : undefined,
            markLine: config.markLine ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              data: [
                { xAxis: eventStart },
                { xAxis: incidentAt },
                { xAxis: eventEnd },
              ],
            } : undefined,
          })),
        };
      }

      async function render(chart, chartOption) {
        chart.clear();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const startedAt = performance.now();
        chart.setOption(chartOption, { notMerge: true, lazyUpdate: false });
        chart.getZr().flush();
        const duration = performance.now() - startedAt;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return duration;
      }

      globalThis.runNexusBenchmark = async ({ rawCount, sampledCount, repetitions }) => {
        const raw = generatePoints(rawCount);
        const sampled = downsample(raw, sampledCount);
        const rawOption = option(raw);
        const sampledOption = option(sampled);
        const chart = echarts.init(document.querySelector("#chart"), undefined, {
          renderer: "canvas",
          devicePixelRatio: 1,
        });

        await render(chart, rawOption);
        await render(chart, sampledOption);

        const rawDurations = [];
        const sampledDurations = [];
        for (let index = 0; index < repetitions; index += 1) {
          rawDurations.push(await render(chart, rawOption));
          sampledDurations.push(await render(chart, sampledOption));
        }

        chart.dispose();
        return { rawDurations, sampledDurations };
      };
    </script>
  </body>
</html>`;

async function measureChartRendering() {
  const echartsBundle = await readFile(new URL("../node_modules/echarts/dist/echarts.esm.min.js", import.meta.url));
  const server = createServer((request, response) => {
    if (request.url === "/echarts.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(echartsBundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(benchmarkPage);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => typeof globalThis.runNexusBenchmark === "function");
    const browserVersion = browser.version();
    const result = await page.evaluate(
      (config) => globalThis.runNexusBenchmark(config),
      { rawCount: rawPointCount, sampledCount: sampledPointCount, repetitions },
    );
    return {
      browserVersion,
      raw: summarize(result.rawDurations),
      sampled: summarize(result.sampledDurations),
    };
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const [baselineBundle, optimizedBundle, chartRendering] = await Promise.all([
  measureBundle(baselineBundleSource),
  measureBundle(optimizedBundleSource),
  measureChartRendering(),
]);

const bundleReduction = 1 - optimizedBundle.gzipBytes / baselineBundle.gzipBytes;
const renderReduction = 1 - chartRendering.sampled.medianMs / chartRendering.raw.medianMs;

const result = {
  measuredAt: new Date().toISOString(),
  environment: {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
    chromium: chartRendering.browserVersion,
    viewport: "1200x700, DPR 1",
    repetitions,
  },
  echartsImportBundle: {
    baseline: baselineBundle,
    optimized: optimizedBundle,
    gzipReductionPercent: Number((bundleReduction * 100).toFixed(1)),
  },
  synchronizedChartRender: {
    scope: {
      panels: 4,
      series: 6,
      sensorSeries: 5,
      includes: ["set-temperature-reference", "linked-axis-pointer", "data-zoom", "mark-area", "mark-line"],
    },
    baseline: { points: rawPointCount, ...chartRendering.raw },
    optimized: { points: sampledPointCount, ...chartRendering.sampled },
    medianReductionPercent: Number((renderReduction * 100).toFixed(1)),
  },
};

console.log(JSON.stringify(result, null, 2));
