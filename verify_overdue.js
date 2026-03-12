import { db } from './src/services/db.js';
import { logic } from './src/services/logic.js';

async function verify() {
  console.log('--- VERIFICATION: DOSSIERS EN RETARD ---\n');
  
  try {
    const workers = await db.getWorkers();
    const weaponHolders = await db.getWeaponHolders();
    
    const overdueWorkers = workers.filter(w => !w.archived && logic.isOverdue(w.next_exam_due));
    const overdueWeapons = weaponHolders.filter(h => !h.archived && logic.isOverdue(h.next_review_date));
    
    console.log(`[TRAVAILLEURS] Total en retard: ${overdueWorkers.length}`);
    overdueWorkers.forEach(w => {
      console.log(` - ${w.full_name} (Mat: ${w.national_id}) | Statut: ${w.latest_status || 'Inconnu'} | Date Prévue: ${w.next_exam_due}`);
    });
    
    console.log(`\n[ARMES] Total en retard: ${overdueWeapons.length}`);
    overdueWeapons.forEach(h => {
      console.log(` - ${h.full_name} (Mat: ${h.national_id}) | Statut: ${h.status || 'Inconnu'} | Date Prévue: ${h.next_review_date}`);
    });

  } catch (error) {
    console.error('Erreur lors de la vérification:', error.message);
  }
}

verify();
