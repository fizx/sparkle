import $ from "sparkle";

const Sunday = 0;

function App() {
  const data = $(async () => {
    const rsp = await fetch(
      "http://worldtimeapi.org/api/timezone/America/Los_Angeles"
    );
    return rsp.json();
  });
  const message = $(() => {
    if (data.value["day_of_week"] === Sunday) {
      return "closed";
    } else {
      return "open";
    }
  });

  return <div>{message.loading ? "loading" : message.value}</div>;
}
