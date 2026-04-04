import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function CompensationChart({ points }) {
  if (!points || points.length === 0) return null;

  const labels = points.map((p) => p.date);
  const rain = points.map((p) => p.rainMm);
  const payouts = points.map((p) => p.payoutAmount);

  const data = {
    labels,
    datasets: [
      {
        label: "Rain (mm)",
        data: rain,
        borderColor: "rgba(13,110,253,1)",
        backgroundColor: "rgba(13,110,253,0.15)",
        yAxisID: "y1",
        tension: 0.3,
        fill: true
      },
      {
        label: "Payout (₹)",
        data: payouts,
        borderColor: "rgba(25,135,84,1)",
        backgroundColor: "rgba(25,135,84,0.15)",
        yAxisID: "y2",
        tension: 0.3,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    interaction: { mode: "index", intersect: false },
    stacked: false,
    plugins: {
      legend: { display: true }
    },
    scales: {
      y1: {
        type: "linear",
        position: "left",
        ticks: { color: "rgba(13,110,253,1)" }
      },
      y2: {
        type: "linear",
        position: "right",
        grid: { drawOnChartArea: false },
        ticks: { color: "rgba(25,135,84,1)" }
      }
    }
  };

  return (
    <div className="card card-glass shadow-sm mb-3">
      <div className="card-body">
        <h5 className="card-title mb-3">Rain vs Payout (Last Days)</h5>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

