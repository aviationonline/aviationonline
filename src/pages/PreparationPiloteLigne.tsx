export default function PreparationPiloteLigne() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">

      <h1 className="text-5xl font-bold mb-8">
        Préparation Pilote de Ligne
      </h1>

      <p className="text-xl mb-8">
        Une formation IFR complète destinée aux futurs pilotes de ligne.
        Conçue par Jean-Claude Chenard, instructeur IFR et MCCI,
        totalisant plus de 25 000 heures d'instruction sur simulateur.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Préparez votre carrière aéronautique
      </h2>

      <p className="mb-6">
        Les compagnies aériennes recherchent des pilotes capables de
        maîtriser les procédures IFR, la gestion de la charge de travail,
        la radionavigation et les approches aux instruments.
      </p>

      <p className="mb-6">
        Cette formation a été conçue pour apporter les connaissances
        indispensables à tout futur pilote professionnel.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Compétences développées
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>Procédures IFR complètes</li>
        <li>SID et STAR</li>
        <li>Attentes IFR</li>
        <li>Approches ILS</li>
        <li>Approches RNAV GNSS</li>
        <li>Gestion de la charge de travail</li>
        <li>Lecture et utilisation des cartes aéronautiques</li>
        <li>Radionavigation VOR, NDB et DME</li>
        <li>Facteurs humains</li>
        <li>Réglementation EASA</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Pourquoi AviationOnline ?
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>Plus de 25 000 heures d'instruction sur simulateur</li>
        <li>Formation conçue par Jean-Claude Chenard</li>
        <li>11 heures de vidéos pédagogiques</li>
        <li>260 QCM corrigés</li>
        <li>Plus de 500 slides de formation</li>
        <li>Accès illimité</li>
        <li>Mises à jour régulières</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Questions fréquentes
      </h2>

      <h3 className="text-xl font-bold mt-6 mb-2">
        Cette formation est-elle adaptée aux élèves pilotes ?
      </h3>

      <p className="mb-6">
        Oui. Elle est conçue pour accompagner les élèves pilotes,
        les pilotes professionnels et toute personne préparant une
        qualification IR.
      </p>

      <h3 className="text-xl font-bold mt-6 mb-2">
        Puis-je suivre la formation à mon rythme ?
      </h3>

      <p className="mb-6">
        Oui. L'accès est disponible en ligne et sans limitation de temps.
      </p>

      <div className="mt-12">
        <a
          href="/login"
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold"
        >
          Accéder à la formation IFR
        </a>
      </div>

    </div>
  );
}
