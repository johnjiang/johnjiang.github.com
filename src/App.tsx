import { ReactTerminal, TerminalContextProvider } from "react-terminal";
import "./App.css";

function App() {
  const commands = {
    whoami: "johnjiang",
    cd: (directory: string) => `changed path to ${directory}`,
  };

  const welcomeMessage = (
    <span>
      Type <strong>help</strong> for command list
      <br />
      <br />
    </span>
  );

  return (
    <TerminalContextProvider>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#F1A031",
        }}
      >
        <div
          style={{
            height: 433,
            maxHeight: "100vh",
            width: 600,
            maxWidth: "100vw",
          }}
        >
          <ReactTerminal
            commands={commands}
            welcomeMessage={welcomeMessage}
            prompt={"$"}
            theme={"dark"}
          />
        </div>
      </div>
    </TerminalContextProvider>
  );
}

export default App;
