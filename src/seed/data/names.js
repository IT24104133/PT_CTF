// Fictional name banks. Combined as first x last, these give tens of thousands of unique
// combinations -- comfortably more than the 1,000+ employees required -- so collisions are rare
// and, when they happen, handled by appending a middle initial (see generators/employees.js).
'use strict';

const FIRST_NAMES = [
  'Daniel', 'Amelia', 'Noah', 'Sophia', 'Ethan', 'Maya', 'Lucas', 'Olivia', 'Nathan', 'Emma',
  'Adrian', 'Chloe', 'Ryan', 'Ella', 'Marcus', 'Lena', 'Aaron', 'Nora', 'Evan', 'Mia',
  'Julian', 'Grace', 'Leo', 'Sophie', 'Caleb', 'Hannah', 'Isaac', 'Layla', 'Owen', 'Zoe',
  'Benjamin', 'Ava', 'Samuel', 'Isabella', 'Henry', 'Charlotte', 'Jack', 'Abigail', 'Wyatt', 'Emily',
  'David', 'Harper', 'Joseph', 'Victoria', 'Carter', 'Scarlett', 'Dominic', 'Ruby', 'Elijah', 'Lucy',
  'Gabriel', 'Aria', 'Anthony', 'Eleanor', 'Miles', 'Naomi', 'Felix', 'Ivy', 'Jonah', 'Stella',
  'Theo', 'Violet', 'Simon', 'Freya', 'Vincent', 'Iris', 'Elliot', 'Willow', 'Xavier', 'Clara',
  'Charles', 'Josephine', 'Patrick', 'Vera', 'Raymond', 'Delia', 'Peter', 'Rosa', 'George', 'June',
  'Andre', 'Priya', 'Farah', 'Amara', 'Devon', 'Jasmine', 'Malik', 'Selena', 'Kenji', 'Yara',
  'Omar', 'Leilani', 'Idris', 'Camille', 'Hugo', 'Talia', 'Mateo', 'Renata', 'Soren', 'Dahlia',
];

const LAST_NAMES = [
  'Mercer', 'Hart', 'Bennett', 'Carter', 'Brooks', 'Richardson', 'Foster', 'Hayes', 'Cooper', 'Mitchell',
  'Parker', 'Morgan', 'Collins', 'Turner', 'Reed', 'Walker', 'Hughes', 'Clarke', 'Lawson', 'Scott',
  'Harrison', 'Ellis', 'Barrett', 'Whitfield', 'Okonkwo', 'Reyes', 'Novak', 'Adeyemi', 'Larsson', 'Park',
  'Fischer', 'Nakamura', 'Vaaranan', 'Kowalski', 'Chen', 'Silva', 'Osei', 'Okafor', 'Rowan', 'Sutter',
  'Delgado', 'Abbott', 'Winters', 'Sinclair', 'Marsh', 'Doyle', 'Pearson', 'Quinn', 'Rhodes', 'Vance',
  'Whitaker', 'Yates', 'Zimmer', 'Alvarez', 'Boyd', 'Cross', 'Dunbar', 'Emery', 'Fenwick', 'Graves',
  'Holt', 'Ingram', 'Jennings', 'Kessler', 'Lindqvist', 'Monroe', 'Nash', 'Osborn', 'Prescott', 'Quintero',
  'Rutherford', 'Sandoval', 'Thackeray', 'Underwood', 'Vasquez', 'Wexler', 'Ashford', 'Bellamy', 'Chastain', 'Drummond',
  'Esposito', 'Farrow', 'Gallo', 'Hensley', 'Ibarra', 'Jaramillo', 'Kimura', 'Leclerc', 'Moreau', 'Nilsson',
  'Odom', 'Petrov', 'Quan', 'Renner', 'Sabatini', 'Tanaka', 'Uzoma', 'Voss', 'Wren', 'Yashida',
];

module.exports = { FIRST_NAMES, LAST_NAMES };
