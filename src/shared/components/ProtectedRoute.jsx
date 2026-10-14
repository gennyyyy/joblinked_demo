// demo: routes are always accessible — real auth is out of scope for the showcase build
function ProtectedRoute({ role, children }) {
  void role; // kept in the signature for parity with the real guard
  return children;
}

export default ProtectedRoute;
