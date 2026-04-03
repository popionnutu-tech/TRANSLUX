const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

(async () => {
  // Delete old CHISINAU_BALTI trips
  const { data: oldTrips, error: delErr } = await db
    .from("trips")
    .delete()
    .eq("direction", "CHISINAU_BALTI")
    .select("id");

  console.log("Deleted old trips:", (oldTrips || []).length, delErr ? delErr.message : "OK");

  // Get or create a generic route for Chisinau direction
  let { data: route } = await db
    .from("routes")
    .select("id")
    .eq("name", "Chișinău - Nord")
    .single();

  if (!route) {
    const { data: newRoute } = await db
      .from("routes")
      .insert({ name: "Chișinău - Nord", active: true })
      .select("id")
      .single();
    route = newRoute;
  }
  console.log("Route ID:", route.id);

  const times = [
    "06:55","07:30","08:10","08:50","09:30","10:00","10:30",
    "11:00","11:30","12:00","12:30","13:00","13:30","13:55",
    "14:20","14:50","15:15","15:40","16:10","16:40","17:10",
    "17:35","18:00","18:15","18:45","19:20","20:00"
  ];

  const trips = times.map(t => ({
    route_id: route.id,
    direction: "CHISINAU_BALTI",
    departure_time: t + ":00",
    active: true,
  }));

  const { data: inserted, error: insErr } = await db
    .from("trips")
    .insert(trips)
    .select("id, departure_time");

  console.log("Inserted:", (inserted || []).length, insErr ? insErr.message : "OK");
  (inserted || []).forEach(t => console.log(" ", t.departure_time.slice(0, 5)));
})();
