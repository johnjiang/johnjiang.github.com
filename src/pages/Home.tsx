import { Link } from "react-router-dom";
import "./Home.css";

function Home() {
  return (
    <div className="geocities-home">
      {/* Under construction banner */}
      <div className="construction-banner">
        <span className="construction-icon">🚧</span>
        <span>UNDER CONSTRUCTION</span>
        <span className="construction-icon">🚧</span>
      </div>

      {/* Main title with rainbow effect */}
      <h1 className="rainbow-text">
        ~~* Welcome to John Jiang's Homepage *~~
      </h1>

      {/* Animated marquee */}
      <div className="marquee-container">
        <div className="marquee-text">
          ★ You are visitor #
          {Math.floor(Math.random() * 99999)
            .toString()
            .padStart(5, "0")}{" "}
          since January 1999! ★ Thanks for stopping by! ★ Best viewed in
          Netscape Navigator 4.0 at 800x600 resolution! ★
        </div>
      </div>

      {/* Horizontal rule with fire */}
      <div className="fire-divider">
        🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥
      </div>

      {/* About section */}
      <div className="section about-section">
        <h2>
          <span className="blink">✨ NEW! ✨</span> About Me
        </h2>
        <table className="about-table">
          <tbody>
            <tr>
              <td className="about-image">
                <span className="big-emoji">💻</span>
              </td>
              <td className="about-text">
                <p>
                  Hello and welcome to my corner of the World Wide Web! My name
                  is <b>John Jiang</b> and I am a software engineer who loves
                  building cool stuff on the internet!
                </p>
                <p>
                  I enjoy coding, hacking on side projects, and exploring new
                  technologies. Feel free to look around!
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Links section */}
      <div className="section links-section">
        <h2>🔥 Cool Links 🔥</h2>
        <ul className="link-list">
          <li>
            <span>👉</span>
            <a
              href="https://github.com/johnjiang"
              target="_blank"
              rel="noopener noreferrer"
            >
              My GitHub Page
            </a>
          </li>
          <li>
            <span>👉</span>
            <a
              href="https://linkedin.com/in/johnjiang101"
              target="_blank"
              rel="noopener noreferrer"
            >
              My LinkedIn Profile
            </a>
          </li>
          <li>
            <span>👉</span>
            <Link to="/terminal" className="terminal-link">
              Enter My Terminal (JohnOS v1.0)
            </Link>
          </li>
        </ul>
      </div>

      {/* Terminal teaser */}
      <div className="section terminal-section">
        <h2>🖥️ JohnOS Terminal 🖥️</h2>
        <div className="terminal-preview">
          <p>
            Experience my website in a <b>RADICAL</b> new way!
          </p>
          <p>
            Click below to enter my custom terminal interface where you can
            explore my resume and more using command-line magic!
          </p>
          <Link to="/terminal" className="enter-terminal-btn">
            ⏎ CLICK HERE TO ENTER THE TERMINAL ⏎
          </Link>
        </div>
      </div>

      {/* Fire divider */}
      <div className="fire-divider">
        🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥
      </div>

      {/* Footer with badges */}
      <div className="footer-badges">
        <div className="badge">📝 Made with Notepad</div>
        <div className="badge">🌐 Netscape Now!</div>
        <div className="badge">💾 800x600</div>
      </div>

      {/* Copyright */}
      <div className="copyright">
        <p>Copyright © 1999-2026 John Jiang. All Rights Reserved.</p>
        <p>
          This page was last updated on{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Geocities banner */}
      <div className="geocities-banner">
        <span className="geocities-text">GeoCities</span>
      </div>
    </div>
  );
}

export default Home;
