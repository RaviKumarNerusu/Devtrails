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

export default function TemperatureChart({ trend }) {
  if (!trend || trend.length === 0) return null;

  const labels = trend.map((p) => p.date);
  const temps = trend.map((p) => p.temp);

  const data = {
    labels,
    datasets: [
      {
        label: "Temperature (°C)",
        data: temps,
        borderColor: "rgba(13,110,253,1)",
        backgroundColor: "rgba(13,110,253,0.2)",
        tension: 0.3,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: true }
    }
  };

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <h5 className="card-title mb-3">5-Day Temperature Trend</h5>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

