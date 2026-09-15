import "dotenv/config";
import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const vehiclesData = [
  [19, '1357', 'JER', '1357 JER', 'Toyota', 'Hilux', 2022, 'Mahd', 'Sohail Akhtar', '0530013676', 121431, 113743],
  [15, '1369', 'JER', '1369 JER', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Muhammad Ibrahim', '0590342314', 339117, 141036],
  [29, '1543', 'BUA', '1543 BUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Mathab akhtar', '0509145107', 225578, 215688],
  [18, '1560', 'EHR', '1560 EHR', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Amir Hassan', '0539571970', 125012, 119639],
  [35, '1706', 'BUA', '1706 BUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Fahad', '0558701125', 251408, 249654],
  [36, '1709', 'BUA', '1709 BUA', 'Toyota', 'Hilux', 2022, 'Mahd', '', '', 289769, 0],
  [4, '1712', 'BUA', '1712 BUA', 'Toyota', 'Hilux', 2022, 'Uglat Asugour', '', '', 242445, 241122],
  [23, '1713', 'BUA', '1713 BUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Akhtar Nawab', '0581430290', 288166, 287577],
  [12, '1715', 'BUA', '1715 BUA', 'Toyota', 'Hilux', 2022, 'Wadi bidah', 'Umar zada', '0537248930', 265337, 246519],
  [8, '1716', 'BUA', '1716 BUA', 'Toyota', 'Hilux', 2022, '', '', '', 201472, 199727],
  [31, '1722', 'BUA', '1722 BUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Muhammad Siddique', '0539147838', 351665, 349922],
  [25, '1737', 'BUA', '1737 BUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Zahid Ali', '0539620670', 186604, 282088],
  [3, '1738', 'BUA', '1738 BUA', 'Toyota', 'Hilux', 2022, 'Bir umq', 'Naveed jamal', '0553715514', 288821, 288821],
  [14, '2110', 'EUA', '2110 EUA', 'Toyota', 'Hilux', 2022, 'Wadi bidah', 'Mohammad Shahbaz', '0505260991', 293659, 286145],
  [30, '2158', 'EUA', '2158 EUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'RIAZ AHMAD', '0534810761', 219617, 219617],
  [21, '2287', 'EUA', '2287 EUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'YASIRTAHSEEN', '0550029861', 294297, 290113],
  [5, '2290', 'EUA', '2290 EUA', 'Toyota', 'Hilux', 2022, 'Wadi bida', '', '', 235926, 227220],
  [24, '2295', 'EUA', '2295 EUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Mohamed Arif', '0506522709', 294170, 291395],
  [9, '2344', 'EUA', '2344 EUA', 'Toyota', 'Hilux', 2022, 'Al Hulayfa', '', '', 0, 0],
  [34, '2349', 'EUA', '2349 EUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Jibu mutumba', '0537991162', 305918, 304045],
  [7, '2687', 'EUA', '2687 EUA', 'Toyota', 'Hilux', 2022, 'Sabeyah', '', '', 0, 0],
  [6, '3296', 'DER', '3296 DER', 'Toyota', 'Hilux', 2022, 'Wadi bidah', '', '', 75152, 72044],
  [27, '4430', 'JUA', '4430 JUA', 'Toyota', 'Hilux', 2022, 'Al Hulayfa', 'Said Muhammad', '0546072027', 237146, 236971],
  [28, '4431', 'JUA', '4431 JUA', 'Toyota', 'Hilux', 2022, 'Al Hulayfa', 'Oluwaseun isreal Adesegun', '0576381685', 268589, 268245],
  [11, '4435', 'JUA', '4435 JUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Zia uddin', '0559076373', 246886, 241801],
  [32, '4463', 'JUA', '4463 JUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Abdul Ghuffar', '0552719412', 220259, 212774],
  [16, '4479', 'JUA', '4479 JUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Muhammad Ahsan', '0558399511', 188695, 186799],
  [10, '4481', 'JUA', '4481 JUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', '', '', 283166, 282387],
  [13, '4532', 'LUA', '4532 LUA', 'Toyota', 'Hilux', 2022, 'Wadi bidah', 'Asif jan', '0559583127', 339566, 342585],
  [22, '4533', 'LUA', '4533 LUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'HAMID ULLAH', '0539579754', 210448, 206460],
  [17, '4534', 'LUA', '4534 LUA', 'Toyota', 'Hilux', 2022, 'Wadi bidah', 'Nafees naseem', '0536389031', 245829, 237481],
  [26, '4538', 'LUA', '4538 LUA', 'Toyota', 'Hilux', 2022, 'Uqlat Saqour', 'Shah Saood', '053397109', 267422, 267417],
  [2, '4541', 'LUA', '4541 LUA', 'Toyota', 'Hilux', 2022, '', 'WBNafees naseem', '0536389031', 278623, 0],
  [1, '4980', 'JUA', '4980 JUA', 'Toyota', 'Hilux', 2022, 'Sabayia', '', '', 308970, 308970],
  [20, '5456', 'TKA', '5456 TKA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Mathab Akhtar', '0509145107', 180737, 172482],
  [33, '6183', 'ZUA', '6183 ZUA', 'Toyota', 'Hilux', 2022, 'Mahd', 'Asad Ullah', '0534399041', 184937, 176280]
];

for (let v of vehiclesData) {
  await client.query(`
    INSERT INTO vehicles (id, plate_number, plate_code, plate, make, model, year, location, driver_name, driver_phone, current_km, last_oil_km)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET 
      current_km = EXCLUDED.current_km,
      last_oil_km = EXCLUDED.last_oil_km,
      driver_name = EXCLUDED.driver_name;
  `, v);
}

console.log("? ?? ????? ?????? ???? ?????? ??? 36 ????? ?? ????? ?????? Neon ?????!");
await client.end();
