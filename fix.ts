import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function fix() {
    try {
        console.log("Restoring mod_radionav...");
        await setDoc(doc(db, 'modules', 'mod_radionav'), {
            title: 'Moyens Radionavigation',
            order: 3,
            createdAt: Timestamp.now()
        }, { merge: true });

        const courses = [
            {
                id: 'course_radionav_vor',
                moduleId: 'mod_radionav',
                title: 'Le VOR (VHF Omnidirectional Range)',
                content: `# Le VOR\n\nLe VOR fournit une information d'azimut magnétique par rapport à la balise.\n\n## Utilisation\n- Sélectionner la fréquence.\n- Identifier la balise (Morse).\n- Afficher la radiale désirée (OBS).\n- Lire l'indication TO/FROM et la déviation (CDI).`,
                order: 1
            },
            {
                id: 'course_radionav_adf',
                moduleId: 'mod_radionav',
                title: 'Le NDB et l\'ADF',
                content: `# Le NDB et l'ADF\n\nLe NDB (Non-Directional Beacon) émet un signal reçu par l'ADF (Automatic Direction Finder).\n\n## Formule de base\n**Gisement + Cap = Relèvement Vrai (QTE) ou Magnétique (QDR)**\n\nL'aiguille pointe toujours vers la station.`,
                order: 2
            },
            {
                id: 'course_radionav_ils',
                moduleId: 'mod_radionav',
                title: 'L\'ILS (Instrument Landing System)',
                content: `# L'ILS\n\nSystème d'atterrissage aux instruments de précision.\n\n## Composants\n- **Localizer (LOC)** : Guidage horizontal (Axe de piste).\n- **Glide Path (GP)** : Guidage vertical (Plan de descente, généralement 3°).\n- **Marker Beacons** : Repères de distance (Outer, Middle, Inner).`,
                order: 3
            },
            {
                id: 'course_nav_2',
                moduleId: 'mod_nav_ifr',
                title: 'Les attentes (Holdings)',
                content: `# Les attentes (Holdings)\n\nL'attente permet de patienter en vol au-dessus d'un repère.\n\n## Les 3 types d'entrées\n- **Directe (Secteur 3)** : Arrivée dans le secteur de 180°.\n- **Décalée (Secteur 2)** : Arrivée dans le secteur de 70° (Teardrop).\n- **Parallèle (Secteur 1)** : Arrivée dans le secteur de 110°.\n\n## Corrections de dérive\nAppliquer 3 fois la dérive dans la branche d'éloignement.`,
                order: 2
            }
        ];

        for (const c of courses) {
            const ref = doc(db, `modules/${c.moduleId}/courses`, c.id);
            await setDoc(ref, {
                title: c.title,
                content: c.content,
                order: c.order,
                createdAt: Timestamp.now()
            }, { merge: true });
        }
        
        console.log("Restored courses successfully.");
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
fix();
