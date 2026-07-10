import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

const DATA_KEY = "flaschen_standalone_data_v1";
const USER_KEY = "flaschen_standalone_user_v1";
const API_KEY = "flaschen_standalone_api_url_v1";

export default function App() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState("scan");
  const [scanEnabled, setScanEnabled] = useState(true);
  const [barcode, setBarcode] = useState(null);
  const [loading, setLoading] = useState(false);

  const [flaschennummer, setFlaschennummer] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [kaeltemittel, setKaeltemittel] = useState("");
  const [mitarbeiter, setMitarbeiter] = useState("");
  const [gps, setGps] = useState(null);

  const [items, setItems] = useState([]);
  const [suche, setSuche] = useState("");
  const [apiUrl, setApiUrl] = useState("");

  useEffect(() => {
    (async () => {
      setItems(JSON.parse((await AsyncStorage.getItem(DATA_KEY)) || "[]"));
      setMitarbeiter((await AsyncStorage.getItem(USER_KEY)) || "");
      setApiUrl((await AsyncStorage.getItem(API_KEY)) || "");
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return items;
    return items.filter(x =>
      `${x.flaschennummer} ${x.lieferant} ${x.kaeltemittel} ${x.mitarbeiter}`
        .toLowerCase()
        .includes(q)
    );
  }, [items, suche]);

  if (!permission) {
    return <View style={styles.center}><Text>Lade Kamera...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Kamera-Zugriff erforderlich</Text>
        <Button title="Kamera erlauben" onPress={requestPermission} />
      </View>
    );
  }

  async function saveAll(next) {
    setItems(next);
    await AsyncStorage.setItem(DATA_KEY, JSON.stringify(next));
  }

  async function rememberUser(value) {
    setMitarbeiter(value);
    await AsyncStorage.setItem(USER_KEY, value);
  }

  async function saveApi(value) {
    setApiUrl(value);
    await AsyncStorage.setItem(API_KEY, value.trim());
  }

  async function getLocation() {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status !== "granted") {
        Alert.alert("Standort", "Standortberechtigung wurde nicht erteilt.");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const value = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
      setGps(value);
      Alert.alert("GPS gespeichert", `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`);
      return value;
    } catch (error) {
      Alert.alert("GPS-Fehler", error.message);
      return null;
    }
  }

  async function analyzeWithAI() {
    if (!apiUrl.trim()) {
      Alert.alert(
        "Keine KI-Adresse",
        "Trage unter Einstellungen eine öffentliche HTTPS-Adresse deines KI-Servers ein."
      );
      return;
    }

    try {
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7
      });

      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode,
          imageBase64: photo.base64
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.error || "KI-Serverfehler");
      }

      const parsed = JSON.parse(data.result);
      setFlaschennummer(parsed.flaschennummer || barcode?.data || "");
      setLieferant(parsed.lieferant || "");
      setKaeltemittel(parsed.kaeltemittel || "");
    } catch (error) {
      Alert.alert("KI nicht erreichbar", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!flaschennummer && !lieferant && !kaeltemittel) {
      Alert.alert("Keine Daten", "Bitte mindestens ein Feld ausfüllen.");
      return;
    }

    const location = gps || await getLocation();
    const now = new Date();

    const item = {
      id: Date.now().toString(),
      flaschennummer: flaschennummer.trim(),
      lieferant: lieferant.trim(),
      kaeltemittel: kaeltemittel.trim(),
      mitarbeiter: mitarbeiter.trim(),
      datum: now.toLocaleDateString("de-DE"),
      uhrzeit: now.toLocaleTimeString("de-DE"),
      latitude: location?.latitude ?? "",
      longitude: location?.longitude ?? ""
    };

    await saveAll([item, ...items]);
    clearForm();
    Alert.alert("Lokal gespeichert", "Der Eintrag wurde direkt auf dem Handy gespeichert.");
  }

  async function deleteItem(id) {
    await saveAll(items.filter(x => x.id !== id));
  }

  function csvEscape(value) {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
  }

  async function exportCsv() {
    try {
      const header = [
        "Flaschennummer",
        "Lieferant",
        "Kältemittel",
        "Mitarbeiter",
        "Datum",
        "Uhrzeit",
        "Breitengrad",
        "Längengrad"
      ];

      const rows = items.map(x => [
        x.flaschennummer,
        x.lieferant,
        x.kaeltemittel,
        x.mitarbeiter,
        x.datum,
        x.uhrzeit,
        x.latitude,
        x.longitude
      ]);

      const csv = "\uFEFF" + [header, ...rows]
        .map(row => row.map(csvEscape).join(";"))
        .join("\r\n");

      const uri = FileSystem.cacheDirectory + "flaschenliste.csv";
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Flaschenliste teilen",
          UTI: "public.comma-separated-values-text"
        });
      } else {
        Alert.alert("Export", `Datei gespeichert: ${uri}`);
      }
    } catch (error) {
      Alert.alert("Export fehlgeschlagen", error.message);
    }
  }

  function clearForm() {
    setScanEnabled(true);
    setBarcode(null);
    setFlaschennummer("");
    setLieferant("");
    setKaeltemittel("");
    setGps(null);
  }

  function scanScreen() {
    return (
      <>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"]
          }}
          onBarcodeScanned={
            scanEnabled
              ? ({ data, type }) => {
                  setBarcode({ data, type });
                  setFlaschennummer(data);
                  setScanEnabled(false);
                }
              : undefined
          }
        />

        <ScrollView style={styles.panel}>
          <Text style={styles.title}>Flasche erfassen</Text>

          <TextInput
            style={styles.input}
            value={mitarbeiter}
            onChangeText={rememberUser}
            placeholder="Mitarbeitername"
          />

          <Text style={styles.label}>Flaschennummer</Text>
          <TextInput style={styles.input} value={flaschennummer} onChangeText={setFlaschennummer} />

          <Text style={styles.label}>Lieferant</Text>
          <TextInput style={styles.input} value={lieferant} onChangeText={setLieferant} />

          <Text style={styles.label}>Kältemittel</Text>
          <TextInput style={styles.input} value={kaeltemittel} onChangeText={setKaeltemittel} />

          <View style={styles.gap} />
          <Button title="Neu scannen / Leeren" onPress={clearForm} />

          <View style={styles.gap} />
          <Button
            title={loading ? "KI analysiert..." : "Foto mit KI auswerten"}
            onPress={analyzeWithAI}
            disabled={loading}
          />
          {loading && <ActivityIndicator />}

          <View style={styles.gap} />
          <Button title="GPS erfassen" onPress={getLocation} />

          <View style={styles.gap} />
          <Button title="Lokal auf dem Handy speichern" onPress={addItem} />

          <View style={styles.gap} />
          <Button title={`Flaschenliste (${items.length})`} onPress={() => setScreen("list")} />

          <View style={styles.gap} />
          <Button title="Einstellungen" onPress={() => setScreen("settings")} />

          <Text style={styles.footer}>
            Barcode, Liste, GPS und CSV-Export funktionieren ohne PC und ohne Server.
          </Text>
        </ScrollView>
      </>
    );
  }

  function listScreen() {
    return (
      <ScrollView style={styles.full}>
        <Text style={styles.title}>Flaschenliste</Text>

        <TextInput
          style={styles.input}
          value={suche}
          onChangeText={setSuche}
          placeholder="Suchen"
        />

        <View style={styles.gap} />
        <Button title="Als CSV für Excel teilen" onPress={exportCsv} />

        {filtered.map(item => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.flaschennummer || "Ohne Nummer"}
            </Text>
            <Text>{item.lieferant || "-"} | {item.kaeltemittel || "-"}</Text>
            <Text>{item.mitarbeiter || "-"} | {item.datum} {item.uhrzeit}</Text>
            {item.latitude !== "" && (
              <Text>GPS: {item.latitude}, {item.longitude}</Text>
            )}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => Alert.alert(
                "Löschen",
                "Eintrag wirklich löschen?",
                [
                  { text: "Abbrechen", style: "cancel" },
                  { text: "Löschen", style: "destructive", onPress: () => deleteItem(item.id) }
                ]
              )}
            >
              <Text style={styles.deleteText}>Löschen</Text>
            </TouchableOpacity>
          </View>
        ))}

        {filtered.length === 0 && <Text style={styles.empty}>Keine Einträge.</Text>}

        <View style={styles.gap} />
        <Button title="Zurück zur Kamera" onPress={() => setScreen("scan")} />
      </ScrollView>
    );
  }

  function settingsScreen() {
    return (
      <ScrollView style={styles.full}>
        <Text style={styles.title}>Einstellungen</Text>
        <Text style={styles.label}>Öffentliche KI-Serveradresse (optional)</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={saveApi}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://dein-server.example.com"
        />
        <Text style={styles.info}>
          Ohne diese Adresse arbeitet die App vollständig lokal; nur die automatische KI-Bilderkennung ist dann deaktiviert.
        </Text>
        <Button title="Zurück" onPress={() => setScreen("scan")} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === "scan"
        ? scanScreen()
        : screen === "list"
        ? listScreen()
        : settingsScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  camera: { flex: 1 },
  panel: { maxHeight: "68%", backgroundColor: "#fff", padding: 16 },
  full: { flex: 1, backgroundColor: "#fff", padding: 18, paddingTop: 44 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  label: { fontWeight: "700", marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    padding: 10,
    marginTop: 6
  },
  gap: { height: 10 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginTop: 10
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  deleteButton: {
    alignSelf: "flex-start",
    backgroundColor: "#b00020",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10
  },
  deleteText: { color: "#fff", fontWeight: "700" },
  footer: { fontSize: 12, color: "#555", marginTop: 16, marginBottom: 24 },
  info: { color: "#555", marginTop: 12, marginBottom: 18 },
  empty: { color: "#555", marginTop: 18 }
});
