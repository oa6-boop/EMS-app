const ModbusRTU = require("modbus-serial");
const mqtt      = require("mqtt");

const MODBUS_HOST = process.env.MODBUS_HOST || "modbus-sim";
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT || "1502");
const MQTT_URL    = process.env.MQTT_URL    || "mqtt://mqtt-broker:1883";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "5000");
const PLANT_NAME  = process.env.PLANT_NAME  || "Plant 1";
const NUM_METERS  = 8;

const METER_TO_LINE = {
  1: "Production Line 1", 2: "Production Line 2",
  3: "Production Line 3", 4: "Production Line 4",
  5: "Production Line 1", 6: "Production Line 2",
  7: "Production Line 3", 8: "Production Line 4",
};

const METER_TO_AREA = {
  1: "Zone A", 2: "Zone B", 3: "Zone C", 4: "Zone D",
  5: "Zone A", 6: "Zone B", 7: "Zone C", 8: "Zone D",
};

const mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 3000 });
mqttClient.on("connect",   () => console.log(`✅ MQTT → ${MQTT_URL}`));
mqttClient.on("error",     (e) => console.error("❌ MQTT:", e.message));
mqttClient.on("reconnect", () => console.log("♻️ MQTT reconnecting..."));

const modbusClient = new ModbusRTU();

async function connectModbus() {
  while (true) {
    try {
      await modbusClient.connectTCP(MODBUS_HOST, { port: MODBUS_PORT });
      modbusClient.setTimeout(3000);
      console.log(`✅ Modbus → ${MODBUS_HOST}:${MODBUS_PORT}`);
      return;
    } catch (err) {
      console.log(`⏳ Modbus not ready, retry in 5s... (${err.message})`);
      await sleep(5000);
    }
  }
}

async function readAndPublish() {
  for (let i = 0; i < NUM_METERS; i++) {
    const slaveId   = i + 1;
    const line      = METER_TO_LINE[slaveId];
    const area      = METER_TO_AREA[slaveId];
    const equipment = `Meter-${slaveId}`;
    const unitName  = `Unit-${Math.ceil(slaveId / 2)}`;

    try {
      modbusClient.setID(slaveId);
      // Registers: [0]kW×10  [1]kVAR×10  [2]V×10  [3]A×10  [4]kWh×10
      const result = await modbusClient.readInputRegisters(0, 5);
      const [kwRaw, kvarRaw, voltRaw, currRaw, kwhRaw] = result.data;

      const kw      = parseFloat((kwRaw   / 10).toFixed(2));
      const kvar    = parseFloat((kvarRaw / 10).toFixed(2));
      const voltage = parseFloat((voltRaw / 10).toFixed(1));
      const current = parseFloat((currRaw / 10).toFixed(2));
      const kwh     = parseFloat((kwhRaw  / 10).toFixed(2));

      const apparent = Math.sqrt(kw * kw + kvar * kvar);
      const pf       = apparent > 0 ? parseFloat((kw / apparent).toFixed(3)) : 1.0;

      // CO2 calculé ici (kgCO2 = kWh × 0.718 facteur ONEE Maroc)
      const co2_kg = parseFloat((kwh * 0.718).toFixed(3));

      // Publication 1 : Puissance active (kW)
      publishMqtt(`ems/telemetry/${line}/electricity`, {
        plant: PLANT_NAME, unit_name: unitName,
        production_line: line, area, equipment,
        energy_name: "Electricity",
        value: kw, unit: "kW", source: "modbus",
        voltage, power_factor: pf, frequency: 50.0, current,
      });

      // Publication 2 : Énergie cumulée (kWh)
      publishMqtt(`ems/telemetry/${line}/kwh`, {
        plant: PLANT_NAME, unit_name: unitName,
        production_line: line, area, equipment,
        energy_name: "Electricity-kWh",
        value: kwh, unit: "kWh", source: "modbus",
        voltage, power_factor: pf, frequency: 50.0,
      });

      // Publication 3 : CO2 émissions calculées
      publishMqtt(`ems/telemetry/${line}/co2`, {
        plant: PLANT_NAME, unit_name: unitName,
        production_line: line, area, equipment,
        energy_name: "CO2-Emissions",
        value: co2_kg, unit: "kgCO2", source: "calculated",
        voltage, power_factor: pf,
      });

      console.log(`📊 ${line} | ${equipment} | kW=${kw} | V=${voltage} | PF=${pf} | kWh=${kwh} | CO2=${co2_kg}kg`);

    } catch (err) {
      console.error(`⚠️ Meter-${slaveId}: ${err.message}`);
    }
    await sleep(200);
  }
}

function publishMqtt(topic, payload) {
  if (!mqttClient.connected) return;
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await connectModbus();
  console.log(`⏱ Polling every ${INTERVAL_MS / 1000}s`);
  await readAndPublish();
  setInterval(readAndPublish, INTERVAL_MS);
})();