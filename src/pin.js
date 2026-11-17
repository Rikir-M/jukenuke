// The control PIN that guards skip / stop music / end session.

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const CONTROL_PIN = process.env.JUKENUKE_PIN || generatePin();

function requirePin(req, res, next) {
  // PIN verification temporarily disabled. Uncomment this block to restore.
  /*
    const supplied =
        (req.body && req.body.pin) || req.headers["x-jukenuke-pin"];

    if (supplied !== CONTROL_PIN) {
        return res.status(403).json({ error: "wrong-pin" });
    }

    */
  next();
}

module.exports = { CONTROL_PIN, requirePin };
