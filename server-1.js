// server.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const API_KEY = 'xxxxxxxxxxxxxxxxxxxx';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper to aggregate 3-hour forecast into daily averages and hourly arrays
function aggregateForecast(list) {
  const hourly = list.map(item => ({
    dt: item.dt,
    dt_txt: item.dt_txt,
    temp: item.main.temp,
    feels_like: item.main.feels_like,
    weather: item.weather[0],
    pop: item.pop
  }));
  const byDay = {};
  list.forEach(it => {
    const date = it.dt_txt.split(' ')[0];
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(it);
  });
  const daily = Object.keys(byDay).slice(0, 7).map(date => {
    const arr = byDay[date];
    const temps = arr.map(x => x.main.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    // pick midday weather icon if exists
    const midday = arr[Math.floor(arr.length / 2)].weather[0];
    return { date, min, max, avg: +(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1), weather: midday };
  });
  return { hourly, daily };
}

app.get('/api/weather', async (req, res) => {
  const city = req.query.city;
  if (!city) return res.status(400).json({ error: 'city required' });

  try {
    // 1) Geo -> lat/lon
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
    const geoResp = await axios.get(geoUrl);
    if (!geoResp.data || !geoResp.data.length) return res.status(404).json({ error: 'city not found' });
    const { lat, lon, name, country } = geoResp.data[0];

    // 2) Current weather
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const weatherResp = await axios.get(weatherUrl);

    // 3) Forecast (5 day / 3 hour)
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const forecastResp = await axios.get(forecastUrl);

    // 4) Pollution
    const pollutionUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const pollutionResp = await axios.get(pollutionUrl);

    // Aggregate forecast
    const agg = aggregateForecast(forecastResp.data.list);

    // Build response
    res.json({
      meta: { query: city, resolvedName: name, country, coordinates: { lat, lon } },
      weather: weatherResp.data,
      forecast: { hourly: agg.hourly, daily: agg.daily },
      pollution: pollutionResp.data
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'API error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
