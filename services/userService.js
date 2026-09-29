const users = [
  { id: 1, name: "Alex" },
  { id: 2, name: "Sam" },
];

function getAllUsers() {
  return users;
}

function getUserById(id) {
  return users.find((user) => user.id === Number(id));
}

module.exports = { getAllUsers, getUserById };
