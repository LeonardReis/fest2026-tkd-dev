import { generateBracket } from './src/utils/bracketEngine.ts';

const athletes = [
  { id: '1', name: 'Atleta 1', academy: 'A' },
  { id: '2', name: 'Atleta 2', academy: 'B' },
  { id: '3', name: 'Atleta 3', academy: 'C' },
];

const matches = generateBracket('fest1', 'cat1', 'group1', athletes);
console.log('Total de Lutas Geradas:', matches.length);
matches.forEach(m => {
  console.log(`Round ${m.round} | Match ${m.matchNumber}: ${m.competitorA?.name} vs ${m.competitorB?.name} | Winner: ${m.winnerId || 'PENDING'}`);
});
