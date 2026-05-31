export default function FormationIFR() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <h1 className="text-5xl font-bold mb-8">
        Formation IFR en ligne
      </h1>

      <p className="text-xl mb-8">
        Formation IFR en ligne conçue par Jean-Claude Chenard,
        instructeur IFR / MCCI avec plus de 25 000 heures
        d'instruction sur simulateur.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Préparation IR EASA
      </h2>

      <p className="mb-6">
        Cette formation couvre l'ensemble des procédures IFR :
        radionavigation, SID, STAR, attentes, approches de précision,
        approches GNSS, réglementation et préparation aux sélections
        compagnies aériennes.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Pourquoi choisir AviationOnline ?
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>Plus de 500 slides pédagogiques</li>
        <li>11 heures de vidéos</li>
        <li>260 QCM corrigés</li>
        <li>Accès illimité</li>
        <li>Mise à jour continue</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-4">
      Programme de la formation IFR
      </h2>

      <p className="mb-6">
      La formation couvre l'ensemble des compétences IFR requises pour
      préparer une qualification IR EASA ou réussir une sélection en
      compagnie aérienne.
      </p>

      <ul className="list-disc pl-6 space-y-2">
      <li>Radio-navigation VOR, NDB, DME</li>
      <li>SID et STAR</li>
      <li>Procédures d'attente</li>
      <li>Approches ILS</li>
      <li>Approches RNAV GNSS</li>
      <li>Réglementation IFR</li>
      <li>Météorologie IFR</li>
      <li>Facteurs humains</li>
      <li>Gestion de la charge de travail</li>
      <li>Préparation aux sélections compagnies aériennes</li>
      </ul>
      
      <div className="mt-12">
        <a
          href="/login"
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold"
        >
          Accéder à la formation
        </a>
      </div>
    </div>
  );
}
